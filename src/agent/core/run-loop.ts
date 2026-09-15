/**
 * Main Run Loop Module
 *
 * Agent 的核心编排循环，协调所有子系统：
 * - Gateway 权限检查（L1）
 * - Tracer 分布式追踪（L5）
 * - Circuit Breaker 熔断保护（L6）
 * - LLM 流式调用和重试
 * - 工具批量执行
 * - 自动验证（Auto-Verify）
 * - 反思机制（Reflexion）
 * - 自我批评（Self-Critique）
 * - 规划器集成（Planner）
 * - 持续学习（Continual Learning）
 *
 * 主循环流程：
 * 1. Gateway 检查 → 准备上下文
 * 2. 开始追踪 → 启动多轮对话
 * 3. 每轮：LLM调用 → 工具执行 → 验证反馈
 * 4. 反循环检测 → 清理资源
 *
 * 集成的高级特性：
 * - Tree-of-Thoughts: 探索多种解决方案
 * - Planner: 自动分步规划
 * - Watcher: 文件修改监控
 * - Memory consolidation: 每10轮合并记忆
 */
import type { AgentState, AssistantContentBlock } from './types.js';
import { config } from '../config.js';
import { streamLLM } from './streaming.js';
import {
  executeToolBatch,
  formatToolResults,
  checkRepetition,
  triggerWatcherChecks,
  clearToolContext,
} from './tool-execution.js';
import { runAutoVerify, runReflexion, runSelfCritique } from './verification.js';
import { prepareContext } from './context.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import { runConsolidation } from '../../experimental/continual-learning/MemoryManager.js';

/**
 * Main agent run loop handling LLM streaming, tool execution, and feedback cycles.
 */
export async function runLoop(state: AgentState, userMsg: string, qtContext?: string): Promise<void> {
  // Gateway (L1) - Check access before proceeding
  const gatewayRequest = state.gateway.createRequest({
    source: 'cli',
    operation: 'agent.run',
    payload: { prompt: userMsg.slice(0, 200) },
    auth: { apiKey: config.apiKey },
  });
  const gatewayResponse = await state.gateway.handle(gatewayRequest);
  if (!gatewayResponse.success) {
    throw new Error(`[Gateway] ${gatewayResponse.error || 'Request rejected by gateway'}`);
  }

  const messages = await prepareContext(state, userMsg, qtContext);

  const traceId = state.tracer.startTrace({
    name: userMsg.slice(0, 60),
    source: 'cli',
    rootOperation: 'agent.run',
  });
  state.currentTraceId = traceId;

  let currentPlanId: string | null = null;

  // ── Main turn loop ──
  const maxTurns = config.maxTurns;

  for (let turn = 0; turn < maxTurns; turn++) {
    logger.debug(`[turn ${turn}] messages count: ${messages.length}`);
    if (messages.length === 0) throw new Error('[Agent] Internal error: messages empty at turn ' + turn);

    // Context window protection
    state.ctxManager.truncateIfNeeded(messages, config.maxTokens);

    const systemPrompt = await state.ctxManager.getSystemPrompt(qtContext as unknown as undefined);

    // LLM call with CircuitBreaker + Tracer
    const streamResult = await state.tracer.traceAsync(traceId, 'llm.stream', 'llm', async (span) => {
      span.tags.model = config.model;
      span.tags.maxTokens = config.maxTokens;

      const cbResult = await state.circuitBreakerManager.get('llm-api').call(async () => {
        return await withRetry(
          async () => {
            return await streamLLM(
              state.client,
              config.model,
              config.maxTokens,
              systemPrompt,
              messages,
              state.cbs,
              (inputTokens, outputTokens) => state.stateManager.updateTokenUsage(inputTokens, outputTokens),
            );
          },
          { maxRetries: state.maxRetries },
        );
      });

      if (!cbResult.success) throw new Error(`LLM API circuit breaker: ${cbResult.error}`);
      return cbResult.data!;
    });

    const { toolCalls, assistantText } = streamResult;
    const assistantContent: AssistantContentBlock[] = [];

    if (assistantText) assistantContent.push({ type: 'text', text: assistantText });
    for (const tc of toolCalls) {
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
    messages.push({ role: 'assistant', content: assistantContent });

    // Anti-repetition
    if (checkRepetition(state, assistantText, toolCalls, messages)) {
      break;
    }

    if (toolCalls.length === 0) {
      state.conversationManager.setHistory(messages);
      break;
    }

    // Execute tools
    const { toolResults, toolResultIds } = await executeToolBatch(
      state,
      toolCalls,
      { model: config.model, maxTokens: config.maxTokens },
      traceId,
    );

    const toolResultContent = formatToolResults(toolResults, toolResultIds);
    messages.push({ role: 'user', content: toolResultContent });

    // Closed-loop: auto-verify
    await runAutoVerify(state, toolCalls, messages);

    // Watcher: post-tool triggers
    triggerWatcherChecks(state, toolCalls);

    // Reflexion
    if (config.reflexion.enabled && state.reflexionEngine.shouldReflect()) {
      await runReflexion(state, messages);
    }

    // Planner step advancement
    if (currentPlanId) {
      const progress = state.planner.advanceStep(currentPlanId);
      if (progress) {
        state.cbs.onToolResult?.('Planner', progress, false);
        if (progress.includes('✅')) {
          currentPlanId = null;
        } else if (turn % 2 === 1) {
          messages.push({ role: 'user', content: progress });
        }
      }
    }

    // Self-Critique
    await runSelfCritique(state, assistantText, toolCalls, toolResults, messages);

    // Continual Learning
    state.consolidationCounter++;
    if (state.consolidationCounter >= 10) {
      state.consolidationCounter = 0;
      runConsolidation()
        .then((report) => {
          if (report.consolidated > 0) {
            logger.debug(`[ContinualLearning] Consolidated ${report.consolidated} memories`);
          }
        })
        .catch((err) =>
          logger.warn('[ContinualLearning] Consolidation failed:', err instanceof Error ? err.message : err),
        );
    }

    state.conversationManager.setHistory(messages);
  }

  clearToolContext();

  if (state.currentTraceId) {
    state.tracer.endTrace(state.currentTraceId);
    state.currentTraceId = '';
  }
}
