/**
 * Agent verification and feedback handling
 * Handles auto-verify, reflexion, and self-critique
 */
import type { LLMMessage } from '../LLMClient.js';
import type { ToolResult } from '../../types.js';
import type { AgentState } from './types.js';
import { config } from '../config.js';
import { FeedbackInjector } from '../../closed-loop/FeedbackInjector.js';
import type { VerificationResult } from '../../closed-loop/VerificationPipeline.js';

export async function runAutoVerify(
  state: AgentState,
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  messages: LLMMessage[],
): Promise<void> {
  if (!config.autoVerify || !state.verificationPipeline) return;

  const writtenFiles = toolCalls
    .filter(
      (tc) => (tc.name === 'Write' || tc.name === 'Edit') && tc.input && (tc.input as Record<string, unknown>).filePath,
    )
    .map((tc) => String((tc.input as Record<string, unknown>).filePath));

  if (writtenFiles.length === 0) return;

  const allResults: VerificationResult[] = [];
  await Promise.all(
    writtenFiles.map(async (fp) => {
      if (config.autoFixOnError) {
        const { results } = await state.verificationPipeline!.verifyWithFix(fp);
        allResults.push(...results);
      } else {
        const results = await state.verificationPipeline!.run(fp);
        allResults.push(...results);
      }
    }),
  );

  const failed = allResults.filter((r) => !r.passed);
  const summary = state.verificationPipeline.formatSummary(allResults);

  state.feedbackInjector.push({ summary, source: 'auto-verify', passed: failed.length === 0, results: allResults });

  if (failed.length > 0) {
    const injectMsg = FeedbackInjector.formatAutoVerify(summary);
    messages.push({ role: 'user', content: injectMsg });
    state.cbs.onToolResult?.('Auto-Verify', summary, true);
  } else {
    state.cbs.onToolResult?.('Auto-Verify', allResults.map((r) => r.tool).join(', ') + ' passed', false);
  }
}

export async function runReflexion(state: AgentState, messages: LLMMessage[]): Promise<void> {
  state.cbs.onAgentDelta?.('\n\n_[Self-reflection triggered: analyzing recent failures...]_');
  const reflection = await state.reflexionEngine.reflect(state.client, config.model, config.maxTokens);
  if (reflection) {
    const injectMsg = [
      '## Self-Reflection Notice',
      '',
      'The system detected a pattern of repeated failures and performed self-reflection.',
      '',
      `**Analysis:** ${reflection.analysis}`,
      '',
      ...(reflection.patterns.length > 0
        ? [`**Identified patterns:**\n${reflection.patterns.map((p: string) => `- ${p}`).join('\n')}`]
        : []),
      '',
      ...(reflection.recommendations.length > 0
        ? [`**Recommendations:**\n${reflection.recommendations.map((r: string) => `- ${r}`).join('\n')}`]
        : []),
      '',
      'Please apply these learnings to avoid repeating the same mistakes.',
    ]
      .filter(Boolean)
      .join('\n');
    messages.push({ role: 'user', content: injectMsg });
    state.cbs.onToolResult?.('Reflexion', reflection.analysis, false);
  }
}

export async function runSelfCritique(
  state: AgentState,
  assistantText: string,
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  toolResults: ToolResult[],
  messages: LLMMessage[],
): Promise<void> {
  if (!assistantText || state.critiqueEngine.getIterationCount()) return;

  const critiqueResult = await state.critiqueEngine.checkAndImprove(
    state.client,
    config.model,
    config.maxTokens,
    assistantText,
    toolCalls,
    toolResults,
  );

  if (critiqueResult.critique && !critiqueResult.passed) {
    const critique = critiqueResult.critique;
    const improvementMsg = [
      '## Self-Critique',
      '',
      `**Quality Score:** ${critique.score}/100`,
      `**Issues identified:** ${critique.issues.map((i) => i.description).join(', ')}`,
      '',
      '**Summary:**',
      critique.summary,
    ].join('\n');
    messages.push({ role: 'user', content: improvementMsg });
    state.cbs.onToolResult?.(
      'Self-Critique',
      `${critique.issues.length} issues found (score: ${critique.score}/100)`,
      false,
    );
  }
}

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
