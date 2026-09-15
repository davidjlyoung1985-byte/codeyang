/**
 * Context Preparation and Enrichment Module
 *
 * 负责准备和丰富 Agent 上下文，包括：
 * - 用户消息格式化
 * - 上下文摘要（规则和 LLM 两种模式）
 * - Tree-of-Thoughts 集成
 * - Planner 集成
 * - 复杂任务检测和引导
 *
 * 核心功能：
 *
 * 1. prepareContext():
 *    - 克隆对话历史
 *    - 检测复杂任务（长度、标点、换行）
 *    - 自动添加"先规划后执行"提示
 *    - 触发上下文摘要（规则+LLM）
 *    - 集成 Tree-of-Thoughts 探索
 *    - 集成 Planner 自动规划
 *
 * 上下文摘要策略：
 * - 规则摘要：基于启发式规则快速压缩
 * - LLM摘要：当消息超过400条时使用 LLM
 * - 保留重要上下文，压缩历史对话
 *
 * Tree-of-Thoughts:
 * - 自动检测需要探索的任务
 * - 生成多种解决方案
 * - 选择最佳路径
 *
 * Planner:
 * - 复杂任务自动分步
 * - 生成依赖关系
 * - 逐步推进执行
 *
 * 使用示例：
 * ```typescript
 * const messages = await prepareContext(state, "实现用户认证", qtContext);
 * // 自动添加规划提示、触发 Tree-of-Thoughts、生成执行计划
 * ```
 */
import type { LLMMessage } from '../LLMClient.js';
import type { AgentState } from './types.js';
import { config } from '../config.js';
import { logger } from '../../utils/logger.js';
import { jsonClone } from '../AgentUtils.js';

export async function prepareContext(state: AgentState, userMsg: string, _qtContext?: string): Promise<LLMMessage[]> {
  const messages = jsonClone(state.conversationManager.getHistory());

  const isComplex =
    userMsg.length > 200 || (userMsg.match(/[。；;.!?？]/g) || []).length >= 2 || userMsg.includes('\n');
  const prompt = isComplex
    ? `Task: ${userMsg}\n\nFirst: briefly outline your approach (what you'll do step by step).\nThen: execute.`
    : userMsg;
  messages.push({ role: 'user', content: prompt });
  state.cbs.onUserMessage?.(userMsg);

  // Context summarization (rule-based)
  const summarized = state.ctxManager.summarizeContext(messages);
  if (summarized !== messages) {
    messages.length = 0;
    messages.push(...summarized);
  }

  // LLM-based summarization for extremely large contexts
  if (messages.length > 200 * 2) {
    const llmSummarized = await state.ctxManager.llmSummarizeContext(
      messages,
      state.client,
      config.model,
      config.maxTokens,
    );
    if (llmSummarized !== messages) {
      messages.length = 0;
      messages.push(...llmSummarized);
      state.cbs.onToolResult?.('Context Summarizer', 'LLM summarized older turns into a concise narrative', false);
    }
  }

  if (messages.length === 0) {
    logger.error(
      `[run] messages is empty! history.length=${state.conversationManager.getHistoryLength()}, prompt="${userMsg}"`,
    );
    throw new Error('Internal error: messages array is empty after summarization');
  }

  // Tree-of-Thoughts
  if (state.treeOfThoughts.shouldUseToT(userMsg)) {
    state.cbs.onAgentDelta?.('\n\n_[🌳 Tree-of-Thoughts: exploring alternative approaches...]_');
    const totResult = await state.treeOfThoughts.explore(state.client, config.model, config.maxTokens, userMsg);
    if (totResult.selected && totResult.selected.steps.length > 0) {
      messages.push({ role: 'user', content: totResult.summary });
      state.cbs.onToolResult?.(
        'Tree-of-Thoughts',
        `${totResult.explored.length} paths explored, selected: ${totResult.selected.approach} (${totResult.selected.evaluation.score}/100)`,
        false,
      );
    }
  }

  // Planner
  if (config.planner.enabled && state.planner.shouldPlan(userMsg)) {
    state.cbs.onAgentDelta?.('\n\n_[Planning: breaking down complex task...]_');
    const plan = await state.planner.generatePlan(state.client, config.model, config.maxTokens, userMsg);
    if (plan && plan.steps.length > 0) {
      const planNotice = [
        '## Generated Plan',
        '',
        `Task: **${plan.task}**`,
        `Total steps: ${plan.steps.length}`,
        '',
        ...plan.steps.map((s, i) => {
          const deps = s.dependencies.length > 0 ? ` (depends on: ${s.dependencies.join(', ')})` : '';
          return `**Step ${i + 1}:** ${s.description}${deps}`;
        }),
        '',
        'Execute this plan step by step. Complete each step before moving to the next.',
      ].join('\n');
      messages.push({ role: 'user', content: planNotice });
      state.cbs.onToolResult?.('Planner', `${plan.steps.length} steps generated`, false);
      state.planner.activatePlan(plan.id);
    }
  }

  return messages;
}
