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

  const subtaskOutputs = await Promise.all(subtasks.map(async (subtask, si) => {
    const lines: string[] = [];
    lines.push(`### Subtask ${si + 1}/${subtasks.length}: ${subtask}`);

    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content: `Execute the following task: ${subtask}\n\nWorking directory: ${cwd}\n\nUse the available tools to complete this task. When done, provide your findings clearly.`,
      },
    ];

    try {
      for (let turn = 0; turn < 10; turn++) {
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
          if (block.type === 'text') textOutput += block.text;
          else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
        }

        messages.push({
          role: 'assistant',
          content: blocks.filter((b) => b.type === 'text' || b.type === 'tool_use').map((b) => {
            if (b.type === 'text') return { type: 'text' as const, text: b.text };
            return { type: 'tool_use' as const, id: b.id, name: b.name, input: JSON.parse(JSON.stringify(b.input)) };
          }),
        });

        if (textOutput) lines.push(textOutput);
        if (toolCalls.length === 0) break;

        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }> = [];
        for (const tc of toolCalls) {
          if (tc.name === 'Question' || tc.name === 'Task') {
            toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: `${tc.name} is not available in sub-agents.`, is_error: false });
            continue;
          }
          const tool = getTool(tc.name);
          if (!tool) { toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: `Unknown tool: ${tc.name}`, is_error: true }); continue; }
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

    lines.push('');
    return lines.join('\n');
  }));

  return [
    `## Task Sub-Agent: ${description}`,
    `Working directory: ${cwd}`,
    `Executing ${subtasks.length} subtask(s) in parallel:`,
    ...subtasks.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    ...subtaskOutputs,
    '---',
    'All subtasks completed. Returning control to main agent.',
  ].join('\n');
}
