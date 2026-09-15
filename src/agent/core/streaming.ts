/**
 * LLM Streaming Module
 *
 * 负责处理 LLM 流式响应，包括：
 * - 文本增量处理
 * - 工具调用累积和解析
 * - Token 使用统计
 * - 连接超时监控
 * - 活动检测和心跳机制
 *
 * 核心功能：
 * - streamLLM(): 主要流式处理函数，带超时保护
 * - 自动监控连接空闲状态
 * - 解析工具调用参数（支持容错）
 * - 实时报告 token 使用情况
 *
 * 使用示例：
 * ```typescript
 * const result = await streamLLM(
 *   client, model, maxTokens, systemPrompt, messages,
 *   callbacks,
 *   (input, output) => console.log(`Tokens: ${input}/${output}`)
 * );
 * ```
 */
import type { LLMClient, LLMMessage } from '../LLMClient.js';
import type { AgentCallbacks } from './types.js';
import { toolSchemas } from '../../tools/index.js';
import { ConnectionMonitor } from '../../utils/connectionMonitor.js';
import { logger } from '../../utils/logger.js';

const STREAM_TIMEOUT_MS = Number(process.env.CODEYANG_STREAM_TIMEOUT) || 180_000;

export interface StreamResult {
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  assistantText: string;
}

/**
 * Handles LLM streaming with timeout protection and activity monitoring.
 */
export async function streamLLM(
  client: LLMClient,
  model: string,
  maxTokens: number,
  systemPrompt: string,
  messages: LLMMessage[],
  cbs: AgentCallbacks,
  onTokenUsage: (inputTokens: number, outputTokens: number) => void,
): Promise<StreamResult> {
  const textParts: string[] = [];
  const toolCallsInner: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  const toolCallsAccum: Map<number, { id?: string; name?: string; args: string }> = new Map();

  // Start connection monitoring
  const monitor = new ConnectionMonitor({
    idleTimeout: STREAM_TIMEOUT_MS,
    heartbeatInterval: 30000,
    onIdle: () => {
      cbs.onError?.('⚠️ 长时间无响应，请检查网络连接或增加超时时间');
    },
  });
  monitor.start();

  const consumeStream = async () => {
    try {
      for await (const event of client.stream({
        model,
        maxTokens,
        temperature: 0.5,
        system: systemPrompt,
        messages,
        tools: toolSchemas(),
      })) {
        // Record activity to reset idle timer
        monitor.recordActivity();

        if (event.type === 'text_delta' && event.text) {
          cbs.onAgentDelta?.(event.text);
          textParts.push(event.text);
        } else if (event.type === 'thinking_delta' && event.text) {
          // Chain-of-thought: show progress, but never fold it into the answer.
          cbs.onThinkingDelta?.(event.text);
        } else if (event.type === 'tool_call_start') {
          toolCallsAccum.set(event.toolCallIndex!, {
            id: event.toolCallId,
            name: event.toolCallName,
            args: '',
          });
        } else if (event.type === 'tool_call_delta') {
          const accum = toolCallsAccum.get(event.toolCallIndex!);
          if (accum) accum.args += event.toolCallArgs || '';
        } else if (event.type === 'tool_call_end') {
          const accum = toolCallsAccum.get(event.toolCallIndex!);
          if (accum) {
            try {
              toolCallsInner.push({
                id: accum.id!,
                name: accum.name!,
                input: JSON.parse(accum.args || '{}'),
              });
            } catch (err) {
              toolCallsInner.push({ id: accum.id!, name: accum.name!, input: {} });
              if (process.env.CODEYANG_DEBUG) logger.warn('[Agent] Failed to parse tool args:', err);
            }
          }
        } else if (event.type === 'usage') {
          if (event.inputTokens !== undefined || event.outputTokens !== undefined) {
            onTokenUsage(event.inputTokens ?? 0, event.outputTokens ?? 0);
          }
        }
      }
      return { toolCalls: toolCallsInner, assistantText: textParts.join('') };
    } finally {
      // Stop monitoring
      monitor.stop();
    }
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      monitor.stop();
      reject(
        new Error(`Stream timed out after ${STREAM_TIMEOUT_MS / 1000}s. Increase CODEYANG_STREAM_TIMEOUT if needed.`),
      );
    }, STREAM_TIMEOUT_MS);
  });

  return Promise.race([consumeStream(), timeoutPromise]);
}
