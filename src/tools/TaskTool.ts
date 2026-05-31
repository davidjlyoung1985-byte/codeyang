import Anthropic from '@anthropic-ai/sdk';
import { toolSchemas, getTool } from './registry.js';

export interface TaskResult {
  description: string;
  subtaskResults: string[];
}

const TASK_SYSTEM_PROMPT = `You are a sub-agent of CodeYang, an AI coding agent. Your job is to execute a specific task and return a concise result.
- Use the available tools to read files, search code, run commands, etc.
- Stay focused on your assigned task. Do not go off on tangents.
- Once you have completed your task, provide a clear, structured summary of your findings.
- Be efficient. You have a maximum of 10 turns.`;

export async function executeTask(
  client: Anthropic,
  model: string,
  maxTokens: number,
  description: string,
  subtasks: string[],
  cwd: string,
): Promise<string> {
  const results: string[] = [];
  results.push(`## Task Sub-Agent: ${description}`);
  results.push(`Working directory: ${cwd}`);
  results.push(`\nExecuting ${subtasks.length} subtask(s):`);
  for (let i = 0; i < subtasks.length; i++) {
    results.push(`  ${i + 1}. ${subtasks[i]}`);
  }
  results.push('');

  for (let si = 0; si < subtasks.length; si++) {
    const subtask = subtasks[si];
    results.push(`### Subtask ${si + 1}/${subtasks.length}: ${subtask}`);

    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content: `Execute the following task: ${subtask}\n\nWorking directory: ${cwd}\n\nUse the available tools to complete this task. When done, provide your findings clearly.`,
      },
    ];

    const maxTurns = 10;

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: TASK_SYSTEM_PROMPT,
          messages,
          tools: toolSchemas(),
        });

        const msg = response as Anthropic.Messages.Message;
        const blocks = msg.content;
        let textOutput = '';
        const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        for (const block of blocks) {
          if (block.type === 'text') {
            textOutput += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }

        // Build assistant content for history
        const assistantContent: Array<
          { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
        > = blocks
          .filter(b => b.type === 'text' || b.type === 'tool_use')
          .map(b => {
            if (b.type === 'text') return { type: 'text' as const, text: b.text };
            return {
              type: 'tool_use' as const,
              id: b.id,
              name: b.name,
              input: JSON.parse(JSON.stringify(b.input)),
            };
          });

        messages.push({ role: 'assistant', content: assistantContent });

        if (textOutput) {
          results.push(textOutput);
        }

        if (toolCalls.length === 0) {
          break; // Task complete, no more tools to call
        }

        // Execute tools
        const toolResults: Array<{
          type: 'tool_result';
          tool_use_id: string;
          content: string;
          is_error: boolean;
        }> = [];

        for (const tc of toolCalls) {
          const tool = getTool(tc.name);
          if (!tool) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: `Unknown tool: ${tc.name}`,
              is_error: true,
            });
            continue;
          }

          // Skip Question tool in sub-agents
          if (tc.name === 'Question') {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: 'Question tool is not available in sub-agents. Make a decision and proceed.',
              is_error: false,
            });
            continue;
          }

          // Skip Task tool in sub-agents to prevent infinite recursion
          if (tc.name === 'Task') {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: 'Nested Task tool is not available in sub-agents. Execute the work directly.',
              is_error: false,
            });
            continue;
          }

          try {
            const output = await tool.execute(tc.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: output,
              is_error: false,
            });
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: err instanceof Error ? err.message : String(err),
              is_error: true,
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      }
    } catch (err) {
      results.push(`**Error**: ${err instanceof Error ? err.message : String(err)}`);
    }

    results.push('');
  }

  results.push('---');
  results.push('All subtasks completed. Returning control to main agent.');
  return results.join('\n');
}
