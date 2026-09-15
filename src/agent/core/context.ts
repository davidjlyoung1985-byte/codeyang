/**
 * Context preparation and enrichment
 * Handles planning, Tree-of-Thoughts, and context summarization
 */
import type { LLMMessage } from '../LLMClient.js';
import type { AgentState } from './types.js';
import { config } from '../config.js';
import { logger } from '../../utils/logger.js';
import { jsonClone } from '../AgentUtils.js';

export async function prepareContext(
  state: AgentState,
  prompt: string,
): Promise<{ messages: LLMMessage[]; userMsg: string }> {
  const messages = jsonClone(state.conversationManager.getHistory());

  const isComplex = prompt.length > 200 || (prompt.match(/[。；;.!?？]/g) || []).length >= 2 || prompt.includes('\n');
  const userMsg = isComplex
    ? `Task: ${prompt}\n\nFirst: briefly outline your approach (what you'll do step by step).\nThen: execute.`
    : prompt;
  messages.push({ role: 'user', content: userMsg });
  state.cbs.onUserMessage?.(prompt);

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
      `[run] messages is empty! history.length=${state.conversationManager.getHistoryLength()}, prompt="${prompt}"`,
    );
    throw new Error('Internal error: messages array is empty after summarization');
  }

  return { messages, userMsg };
}

export async function enrichWithPlanning(state: AgentState, prompt: string, messages: LLMMessage[]): Promise<void> {
  // Tree-of-Thoughts
  if (state.treeOfThoughts.shouldUseToT(prompt)) {
    state.cbs.onAgentDelta?.('\n\n_[🌳 Tree-of-Thoughts: exploring alternative approaches...]_');
    const totResult = await state.treeOfThoughts.explore(state.client, config.model, config.maxTokens, prompt);
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
  if (config.planner.enabled && state.planner.shouldPlan(prompt)) {
    state.cbs.onAgentDelta?.('\n\n_[Planning: breaking down complex task...]_');
    const plan = await state.planner.generatePlan(state.client, config.model, config.maxTokens, prompt);
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
        'Follow this plan step-by-step. After each step, report progress.',
      ].join('\n');
      messages.push({ role: 'user', content: planNotice });
      state.cbs.onToolResult?.('Planner', `Generated ${plan.steps.length}-step plan`, false);
    }
  }
}
