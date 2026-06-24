import { toolSchemas, getTool } from './registry.js';
import { consumeStream, type LLMClient, type LLMMessage } from '../agent/LLMClient.js';

export interface TaskResult {
  description: string;
  subtaskResults: string[];
}

const TASK_SYSTEM_PROMPT = `You are a sub-agent of CodeYang, an AI coding agent. Your job is to execute a specific task and return a concise result.
- Use the available tools to read files, search code, run commands, etc.
- Stay focused on your assigned task. Do not go off on tangents.
- Once you have completed your task, provide a clear, structured summary of your findings.
- Be efficient. You have a maximum of 10 turns.`;

const SUBTASK_TIMEOUT_MS = 120_000; // 单子任务 2 分钟超时
const MAX_TURNS = 10;
const MAX_SUBTASKS = 3; // 每层最多 3 个子任务

/**
 * SECURITY: Whitelist of tools allowed in subagents
 *
 * Subagents should only have read-only access to prevent privilege escalation.
 * Write operations (Bash, Write, Edit, Delete, Git) are restricted to the main agent.
 */
const SUBAGENT_ALLOWED_TOOLS = new Set([
  // Read-only file operations
  'Read',
  'Glob',
  'Grep',

  // Network operations (read-only)
  'WebFetch',
  'WebSearch',

  // Information gathering
  'GitLog',
  'GitStatus',
  'GitDiff',

  // Safe utilities
  'Math',
  'Memory', // Read/Recall only
]);

/**
 * 拦截子代理中不允许的工具
 *
 * SECURITY: Subagents cannot use:
 * - Question (requires human interaction)
 * - Task/Agent (prevents recursive subagents)
 * - Write operations (Bash, Write, Edit, Delete, Git commit/push)
 * - LaunchApp (prevents arbitrary program execution)
 * - PowerShell (same as Bash)
 */
function isDisallowedInSubagent(name: string): boolean {
  // Explicitly blocked tools
  if (name === 'Question' || name === 'Task' || name === 'Agent') {
    return true;
  }

  // Only allow tools in the whitelist
  return !SUBAGENT_ALLOWED_TOOLS.has(name);
}

/**
 * 执行一个子代理任务，带超时和取消支持。
 *
 * @param signal  AbortSignal，从主 Agent 传入，SIGINT 时取消所有子代理
 */
export async function executeTask(
  client: LLMClient,
  model: string,
  maxTokens: number,
  description: string,
  subtasks: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  // Cap subtasks to MAX_SUBTASKS to maintain 3-layer × 3-agent structure
  const cappedSubtasks = subtasks.slice(0, MAX_SUBTASKS);
  const header = [
    `## Task Sub-Agent: ${description}`,
    `Working directory: ${cwd}`,
    `Executing ${cappedSubtasks.length} subtask(s):`,
    ...cappedSubtasks.map((s, i) => `  ${i + 1}. ${s}`),
    '',
  ].join('\n');

  const subtaskOutputs = await Promise.all(
    cappedSubtasks.map(async (subtask, si) => {
      return executeSingleSubtask(client, model, maxTokens, subtask, si, cappedSubtasks.length, cwd, signal);
    }),
  );

  return [header, ...subtaskOutputs, '---', 'All subtasks completed. Returning control to main agent.'].join('\n');
}

/**
 * 执行单个子任务，带超时和轮次限制。
 */
async function executeSingleSubtask(
  client: LLMClient,
  model: string,
  maxTokens: number,
  subtask: string,
  index: number,
  total: number,
  cwd: string,
  parentSignal?: AbortSignal,
): Promise<string> {
  const lines: string[] = [];
  lines.push(`### Subtask ${index + 1}/${total}: ${subtask}`);

  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: `Execute the following task: ${subtask}\n\nWorking directory: ${cwd}\n\nUse the available tools to complete this task. When done, provide your findings clearly.`,
    },
  ];

  // 为每个子任务创建独立的 AbortController，链接到父 signal
  const controller = new AbortController();

  if (parentSignal) {
    // 父 signal 取消时，自动取消此子任务
    const onParentAbort = () => controller.abort();
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  // 整体超时
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort();
      lines.push('\n**Subtask timed out**');
    }
  }, SUBTASK_TIMEOUT_MS);

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (controller.signal.aborted) {
        lines.push('\n**Subtask cancelled**');
        break;
      }

      const streamPromise = consumeStream(client, {
        model,
        maxTokens,
        temperature: 0.5,
        system: TASK_SYSTEM_PROMPT,
        messages,
        tools: toolSchemas(),
      });

      // 支持通过 signal 取消正在进行的 LLM 流式请求
      const { text: textOutput, toolCalls } = await raceAgainstSignal(streamPromise, controller.signal);

      const assistantContent: Array<
        { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
      > = [];
      if (textOutput) {
        assistantContent.push({ type: 'text', text: textOutput });
      }
      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      messages.push({ role: 'assistant', content: assistantContent });

      if (textOutput) lines.push(textOutput);
      if (toolCalls.length === 0) break;

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }> = [];
      for (const tc of toolCalls) {
        if (controller.signal.aborted) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: 'Cancelled',
            is_error: true,
          });
          continue;
        }

        if (isDisallowedInSubagent(tc.name)) {
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
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: `Unknown tool: ${tc.name}`,
            is_error: true,
          });
          continue;
        }

        try {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: await tool.execute(tc.input),
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
    lines.push(`**Error**: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 让一个 Promise 与 AbortSignal 竞争：signal 触发时立即 reject。
 * 用于支持流式请求的取消。
 *
 * SECURITY FIX: Properly clean up event listener to prevent memory leak
 */
async function raceAgainstSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (!signal.aborted) {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        const abortHandler = () => {
          reject(new DOMException('Subtask cancelled', 'AbortError'));
        };
        signal.addEventListener('abort', abortHandler, { once: true });

        // SECURITY FIX: Remove listener if promise resolves first
        promise
          .finally(() => {
            signal.removeEventListener('abort', abortHandler);
          })
          .catch(() => {
            // Ignore promise rejection, we only care about cleanup
          });
      }),
    ]);
  }
  throw new DOMException('Subtask cancelled', 'AbortError');
}
