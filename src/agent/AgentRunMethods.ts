/**
 * Agent Run Method - Refactored Private Methods
 *
 * This file contains private methods extracted from Agent.run()
 * to improve testability and maintainability.
 */

import type { LLMMessage } from './LLMClient.js';
import { isComplexPrompt, formatComplexPrompt, validateMessages } from './AgentRunHelpers.js';
import { config } from './config.js';
import { setToolContext } from '../tools/registry.js';
import { jsonClone } from './AgentUtils.js';
import { logger } from '../utils/logger.js';

/**
 * Setup data returned from initialization
 */
export interface SetupData {
  traceId: string;
  abortController: AbortController;
}

/**
 * These methods should be added to the Agent class as private methods
 */

/**
 * Step 1: Initialize gateway and tracer
 */
export async function setupRunInitialization(
  gateway: any,
  tracer: any,
  prompt: string,
): Promise<SetupData> {
  // Gateway validation
  const gatewayRequest = gateway.createRequest({
    source: 'cli',
    operation: 'agent.run',
    payload: { prompt: prompt.slice(0, 200) },
    auth: { apiKey: config.apiKey },
  });

  const gatewayResponse = await gateway.handle(gatewayRequest);
  if (!gatewayResponse.success) {
    throw new Error(`[Gateway] ${gatewayResponse.error || 'Request rejected by gateway'}`);
  }

  // Start tracing
  const traceId = tracer.startTrace({
    name: prompt.slice(0, 60),
    source: 'cli',
    rootOperation: 'agent.run',
  });

  const abortController = new AbortController();

  return { traceId, abortController };
}

/**
 * Step 2: Prepare messages with user prompt
 */
export function prepareMessages(
  conversationHistory: LLMMessage[],
  prompt: string,
  onUserMessage?: (msg: string) => void,
): LLMMessage[] {
  const messages = jsonClone(conversationHistory);

  // Format prompt based on complexity
  const userMsg = isComplexPrompt(prompt) ? formatComplexPrompt(prompt) : prompt;

  messages.push({ role: 'user', content: userMsg });
  onUserMessage?.(prompt);

  return messages;
}

/**
 * Step 3: Setup tool context
 */
export function setupToolContext(
  client: any,
  signal: AbortSignal | undefined,
): void {
  setToolContext({
    anthropicClient: null,
    llmClient: client,
    model: config.model,
    maxTokens: config.maxTokens,
    cwd: process.cwd(),
    signal,
  });
}

/**
 * Step 4: Handle context summarization
 */
export async function handleContextSummarization(
  messages: LLMMessage[],
  ctxManager: any,
  client: any,
  onToolResult?: (name: string, result: string, isError: boolean) => void,
): Promise<void> {
  // Rule-based summarization
  const summarized = ctxManager.summarizeContext(messages);
  if (summarized !== messages) {
    messages.length = 0;
    messages.push(...summarized);
  }

  // LLM-based summarization for large contexts
  if (messages.length > 400) {
    const llmSummarized = await ctxManager.llmSummarizeContext(
      messages,
      client,
      config.model,
      config.maxTokens,
    );

    if (llmSummarized !== messages) {
      messages.length = 0;
      messages.push(...llmSummarized);
      onToolResult?.(
        'Context Summarizer',
        'LLM summarized older turns into a concise narrative',
        false,
      );
    }
  }

  validateMessages(messages, 'after-summarization');
}

/**
 * Step 5: Handle Tree-of-Thoughts phase
 */
export async function handleTreeOfThoughts(
  treeOfThoughts: any,
  prompt: string,
  messages: LLMMessage[],
  client: any,
  onAgentDelta?: (delta: string) => void,
  onToolResult?: (name: string, result: string, isError: boolean) => void,
): Promise<void> {
  if (!treeOfThoughts.shouldUseToT(prompt)) {
    return;
  }

  onAgentDelta?.('\n\n_[🌳 Tree-of-Thoughts: exploring alternative approaches...]_');

  const totResult = await treeOfThoughts.explore(
    client,
    config.model,
    config.maxTokens,
    prompt,
  );

  if (totResult.selected && totResult.selected.steps.length > 0) {
    messages.push({ role: 'user', content: totResult.summary });
    onToolResult?.(
      'Tree-of-Thoughts',
      `${totResult.explored.length} paths explored, selected: ${totResult.selected.approach} (${totResult.selected.evaluation.score}/100)`,
      false,
    );
  }
}

/**
 * Step 6: Handle Planner phase
 */
export async function handlePlanner(
  planner: any,
  prompt: string,
  messages: LLMMessage[],
  client: any,
  onAgentDelta?: (delta: string) => void,
  onToolResult?: (name: string, result: string, isError: boolean) => void,
): Promise<string | null> {
  if (!config.planner.enabled || !planner.shouldPlan(prompt)) {
    return null;
  }

  onAgentDelta?.('\n\n_[Planning: breaking down complex task...]_');

  const plan = await planner.generatePlan(client, config.model, config.maxTokens, prompt);

  if (plan && plan.steps.length > 0) {
    const planNotice = [
      '## Generated Plan',
      '',
      `Task: **${plan.task}**`,
      `Total steps: ${plan.steps.length}`,
      '',
      ...plan.steps.map((s: any, i: number) => {
        const deps = s.dependencies.length > 0 ? ` (depends on: ${s.dependencies.join(', ')})` : '';
        return `**Step ${i + 1}:** ${s.description}${deps}`;
      }),
      '',
      'Execute this plan step by step. Complete each step before moving to the next.',
    ].join('\n');

    messages.push({ role: 'user', content: planNotice });
    onToolResult?.('Planner', `${plan.steps.length} steps generated`, false);
    planner.activatePlan(plan.id);

    return plan.id;
  }

  return null;
}

/**
 * Step 7: Cleanup after run
 */
export function cleanupRun(
  tracer: any,
  traceId: string,
): void {
  setToolContext(null);

  if (traceId) {
    tracer.endTrace(traceId);
  }
}
