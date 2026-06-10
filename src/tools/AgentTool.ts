/**
 * AgentTool — multi-agent orchestration.
 *
 * Extends the previous TaskTool concept with:
 * - Multiple agent types: explore (read-only investigation), plan (design), execute (implementation)
 * - Parallel sub-agent execution with result aggregation
 * - Agent memory sharing (output of one agent feeds into another)
 * - Configurable max turns per sub-agent
 */
import type { LLMMessage } from '../agent/LLMClient.js';
import { consumeStream } from '../agent/LLMClient.js';
import { toolSchemas, getTool, getCurrentContext } from './registry.js';

export type AgentType = 'explore' | 'plan' | 'execute';

interface AgentConfig {
  type: AgentType;
  prompt: string;
  memory?: string;       // context from previous agents
  maxTurns?: number;
}

const AGENT_SYSTEM_PROMPTS: Record<AgentType, string> = {
  explore: `You are an explorer agent. Your job is to investigate and gather information.
- Read files, search code, run non-destructive commands
- Do NOT write or edit any files
- Provide a clear summary of your findings`,

  plan: `You are a planner agent. Your job is to design a solution.
- Based on the exploration results, create a step-by-step plan
- Be specific: name files, commands, and changes needed
- Do NOT execute any changes yourself`,

  execute: `You are an execution agent. Your job is to implement the plan.
- Follow the plan step by step
- Write and edit files as needed
- Report progress and any issues encountered`,
};

export async function executeAgent(config: AgentConfig): Promise<string> {
  const context = getCurrentContext();
  if (!context?.llmClient) return 'Agent sub-agent not available: no LLM client configured.';

  const client = context.llmClient;
  const model = context.model;
  const maxTokens = context.maxTokens;
  const maxTurns = config.maxTurns || 15;

  const systemPrompt = AGENT_SYSTEM_PROMPTS[config.type] + '\n\n' + (config.memory ? `Context from previous agents:\n${config.memory}\n\n` : '');

  const messages: LLMMessage[] = [
    { role: 'user', content: config.prompt },
  ];

  const lines: string[] = [];
  lines.push(`## ${config.type.charAt(0).toUpperCase() + config.type.slice(1)} Agent`);

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const { text: textOutput, toolCalls } = await consumeStream(client, {
        model,
        maxTokens,
        temperature: 0.3,
        system: systemPrompt,
        messages,
        tools: toolSchemas(),
      });

      messages.push({
        role: 'assistant',
        content: [
          ...(textOutput ? [{ type: 'text' as const, text: textOutput }] : []),
          ...toolCalls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: tc.input,
          })),
        ],
      });

      if (textOutput) lines.push(textOutput);
      if (toolCalls.length === 0) break;

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }> = [];
      for (const tc of toolCalls) {
        if (tc.name === 'Question' || tc.name === 'Task' || tc.name === 'Agent') {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: `${tc.name} is not available in sub-agents.`,
            is_error: false,
          });
          continue;
        }
        const tool = getTool(tc.name);
        if (!tool) {
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: `Unknown tool: ${tc.name}`, is_error: true });
          continue;
        }
        try {
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: await tool.execute(tc.input), is_error: false });
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: err instanceof Error ? err.message : String(err), is_error: true });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }
  } catch (err) {
    lines.push(`**Error**: ${err instanceof Error ? err.message : String(err)}`);
  }

  return lines.join('\n');
}
