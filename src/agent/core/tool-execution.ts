/**
 * Tool Execution Module
 *
 * 负责工具批量执行和重复检测，包括：
 * - 工具调用批处理
 * - 精确和模糊重复检测
 * - 工具结果格式化
 * - Watcher 集成（文件修改监控）
 * - 中断信号处理
 *
 * 核心功能：
 * - executeToolBatch(): 批量执行工具并返回结果
 * - checkRepetition(): 检测 Agent 循环（精确+模糊）
 * - formatToolResults(): 格式化工具结果为 LLM 消息
 * - triggerWatcherChecks(): 触发文件修改监控
 * - pushCancelledToolResults(): 推送取消的工具结果
 *
 * 反循环机制：
 * - 精确重复：连续两次相同的文本输出
 * - 模糊重复：前100字符相似度检查
 * - 自动中止并注入取消消息
 */
import type { LLMMessage } from '../LLMClient.js';
import type { ToolResult } from '../../types.js';
import type { AgentState, ToolResultBlock } from './types.js';
import { setToolContext } from '../../tools/index.js';
import { checkExactRepeat } from '../AgentUtils.js';

const SIMILARITY_PREFIX_LEN = 100;

/**
 * Executes a batch of tool calls and returns formatted results.
 */
export async function executeToolBatch(
  state: AgentState,
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  config: { model: string; maxTokens: number },
  traceId: string,
): Promise<{ toolResults: ToolResult[]; toolResultIds: string[] }> {
  state.abortController = state.abortController ?? new AbortController();
  const signal = state.abortController.signal;

  setToolContext({
    anthropicClient: null,
    llmClient: state.client,
    model: config.model,
    maxTokens: config.maxTokens,
    cwd: process.cwd(),
    signal,
  });

  const { results: toolResults, ids: toolResultIds } = await state.toolExecutor.executeToolBatch(
    toolCalls,
    signal,
    state.cbs,
    traceId,
    state.tracer,
    () => state.stateManager.askQuestion(),
  );

  state.abortController = null;
  return { toolResults, toolResultIds };
}

/**
 * Formats tool results as LLM message content blocks.
 */
export function formatToolResults(toolResults: ToolResult[], toolResultIds: string[]): ToolResultBlock[] {
  return toolResults.map((tr, i) => ({
    type: 'tool_result',
    tool_use_id: toolResultIds[i] ?? 'unknown',
    content: tr.output,
    is_error: tr.isError,
  }));
}

/**
 * Checks for exact and fuzzy repetition in assistant responses.
 * Returns true if repetition detected (should break loop).
 */
export function checkRepetition(
  state: AgentState,
  assistantText: string,
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  messages: LLMMessage[],
): boolean {
  if (!assistantText) return false;

  const lastText = state.stateManager.getLastAssistantText();
  const repeatCount = state.stateManager.getRepeatCount();
  const exactCheck = checkExactRepeat(assistantText, lastText, repeatCount, 2);
  state.stateManager.updateRepeatCount(exactCheck.isRepeat);

  if (exactCheck.isRepeat) {
    state.cbs.onError?.('Agent loop detected (exact repeat) — stopping');
    pushCancelledToolResults(messages, toolCalls);
    state.conversationManager.setHistory(messages);
    return true;
  }

  if (state.stateManager.checkFuzzyRepeat(assistantText, SIMILARITY_PREFIX_LEN)) {
    state.cbs.onError?.('Agent loop detected (similar repeat) — stopping');
    pushCancelledToolResults(messages, toolCalls);
    state.conversationManager.setHistory(messages);
    return true;
  }

  state.stateManager.updateLastAssistantText(assistantText);
  state.stateManager.recordAssistantText(assistantText);
  return false;
}

/**
 * Pushes cancelled tool results to messages when repetition is detected.
 */
export function pushCancelledToolResults(
  messages: LLMMessage[],
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
): void {
  if (toolCalls.length > 0) {
    messages.push({
      role: 'user',
      content: toolCalls.map((tc) => ({
        type: 'tool_result' as const,
        tool_use_id: tc.id,
        content: '[Cancelled by anti-repetition guard]',
        is_error: true,
      })),
    });
  }
}

/**
 * Triggers watcher post-tool checks for file modifications.
 */
export function triggerWatcherChecks(
  state: AgentState,
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
): void {
  if (!state.watcher) return;

  for (const tc of toolCalls) {
    state.watcher.checkPostTool({
      filePath: String((tc.input as Record<string, unknown>)?.filePath ?? ''),
      toolName: tc.name,
      toolInput: tc.input as Record<string, unknown>,
    });
  }
}

/**
 * Clears tool execution context.
 */
export function clearToolContext(): void {
  setToolContext(null);
}
