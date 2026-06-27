/**
 * AgentContextManager — handles context summarization, memory loading,
 * system prompt building, and token estimation for the Agent.
 */
import type { LLMClient, LLMMessage } from './LLMClient.js';
import { config } from './config.js';
import type { QtContext } from '../qt/index.js';
import { getMemorySummary, getMemoryVersion } from '../utils/memoryStore.js';
import { getAllToolWeights } from '../tools/rl-weighter.js';
import { logger } from '../utils/logger.js';
import { estimateMessageTokens } from './AgentUtils.js';

// ── Defaults ───────────────────────────────────────────────

const CONTEXT_SOFT_LIMIT = 200;
const CONTEXT_KEEP_RECENT = 50;
const DECISION_MAX_LEN = 200;
const DECISION_TRUNCATE = 150;
const FILE_LIST_TRUNCATE = 300;
const TOP_TOOLS_COUNT = 10;
const KEY_DECISIONS_COUNT = 5;

export class AgentContextManager {
  // System prompt cache
  private cachedSystemPrompt: string | null = null;
  private cachedSystemPromptVersion = -1;

  // Memory
  private memorySummary: string | null = null;
  private memoryLoadFailure = false;
  private lastMemoryVersion = -1;

  // Reflexion engine reference (for learned patterns injection)
  private getLearnedPatterns: (max: number) => Promise<string | null>;

  constructor(getLearnedPatterns: (max: number) => Promise<string | null>) {
    this.getLearnedPatterns = getLearnedPatterns;
  }

  /** Invalidate system prompt cache (called on config change). */
  invalidateCache(): void {
    this.cachedSystemPrompt = null;
    this.cachedSystemPromptVersion = -1;
  }

  // ── Memory ───────────────────────────────────────────────

  private async ensureMemoryLoaded(): Promise<string> {
    let currentVersion = -1;
    try {
      currentVersion = getMemoryVersion();
    } catch (err) {
      this.memoryLoadFailure = true;
      if (process.env.CODEYANG_DEBUG) {
        console.warn('[AgentContextManager] Failed to get memory version:', err);
      }
      return '';
    }
    if (this.memorySummary !== null && currentVersion === this.lastMemoryVersion) {
      return this.memorySummary;
    }
    if (this.memoryLoadFailure) return '';

    try {
      this.memorySummary = await getMemorySummary();
      this.lastMemoryVersion = currentVersion;
      this.memoryLoadFailure = false;
    } catch (err) {
      this.memoryLoadFailure = true;
      this.memorySummary = '';
      console.warn('[AgentContextManager] Failed to load memory:', err instanceof Error ? err.message : String(err));
    }
    return this.memorySummary ?? '';
  }

  // ── System Prompt ────────────────────────────────────────

  /** Build the system prompt, caching across identical memory versions. */
  async getSystemPrompt(qtContext?: QtContext): Promise<string> {
    const memVersion = getMemoryVersion();
    if (this.cachedSystemPrompt !== null && memVersion === this.cachedSystemPromptVersion) {
      return this.cachedSystemPrompt;
    }

    const memoryContext = await this.ensureMemoryLoaded();
    let prompt = memoryContext
      ? config.getSystemPrompt(qtContext) + '\n\n## Your Memory\n' + memoryContext
      : config.getSystemPrompt(qtContext);

    // Reflexion: inject learned patterns
    if (config.reflexion.autoInject) {
      const learnedPatterns = await this.getLearnedPatterns(3);
      if (learnedPatterns) {
        prompt += '\n\n## Learned Patterns (from past failures)\n' + learnedPatterns;
      }
    }

    // RL tool weights: inject adaptive tool selection hints
    const toolWeights = getAllToolWeights();
    if (toolWeights.length > 0) {
      const topTools = toolWeights
        .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight)
        .slice(0, 10)
        .filter((t: { calls: number }) => t.calls > 2);

      if (topTools.length > 0) {
        prompt += '\n\n## Tool Performance (RL-based recommendations)\n';
        prompt += 'Based on past performance, prefer these tools when applicable:\n';
        topTools.forEach((tool: { name: string; successRate: number; calls: number }) => {
          prompt += `- ${tool.name}: ${(tool.successRate * 100).toFixed(0)}% success rate (${tool.calls} uses)\n`;
        });
        prompt += '\nLower-performing tools may still be appropriate for specific tasks.\n';
      }
    }

    this.cachedSystemPrompt = prompt;
    this.cachedSystemPromptVersion = memVersion;
    return prompt;
  }

  // ── Context Summarization ────────────────────────────────

  /**
   * Rule-based context summarization. When message count exceeds the soft limit,
   * older messages are replaced with a structured summary of files changed,
   * tools used, key decisions, and errors encountered.
   */
  summarizeContext(messages: LLMMessage[]): LLMMessage[] {
    logger.debug(`[summarizeContext] input: ${messages.length}, limit: ${CONTEXT_SOFT_LIMIT}`);
    if (messages.length <= CONTEXT_SOFT_LIMIT) return messages;

    let cutIndex = messages.length - CONTEXT_KEEP_RECENT;
    if (cutIndex <= 0) return messages;

    while (cutIndex < messages.length) {
      const firstRetained = messages[cutIndex];
      const hasOrphanToolUse =
        firstRetained.role === 'assistant' &&
        Array.isArray(firstRetained.content) &&
        firstRetained.content.some((b: { type: string }) => b.type === 'tool_use');
      const hasOrphanToolResult =
        firstRetained.role === 'user' &&
        Array.isArray(firstRetained.content) &&
        firstRetained.content.some((b: { type: string }) => b.type === 'tool_result');
      if (hasOrphanToolUse || hasOrphanToolResult) {
        cutIndex++;
        if (cutIndex >= messages.length) {
          cutIndex = messages.length - 1;
          break;
        }
      } else {
        break;
      }
    }

    if (cutIndex >= messages.length) return messages;

    const toSummarize = messages.slice(0, cutIndex);
    const fileChanges = new Map<string, string[]>();
    const decisions: string[] = [];
    const toolCounts = new Map<string, number>();
    const errors: string[] = [];
    let totalTurns = 0;

    for (const m of toSummarize) {
      totalTurns++;

      if (m.role === 'user' && typeof m.content === 'string' && m.content.length > 0) {
        const trimmed = m.content.replace(/\n/g, ' ').slice(0, DECISION_TRUNCATE).trim();
        if (
          trimmed.length > 0 &&
          trimmed.length < DECISION_MAX_LEN &&
          !trimmed.startsWith('[') &&
          !trimmed.startsWith('#')
        ) {
          decisions.push(trimmed);
        }
      }

      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'tool_use' && b.name) {
            toolCounts.set(b.name, (toolCounts.get(b.name) || 0) + 1);

            if ((b.name === 'Write' || b.name === 'Edit') && b.input) {
              const path = String((b.input as Record<string, unknown>)['filePath'] ?? '');
              if (path) {
                if (!fileChanges.has(path)) fileChanges.set(path, []);
                const ops = fileChanges.get(path)!;
                if (!ops.includes(b.name)) ops.push(b.name);
              }
            }
            if (b.name === 'Bash' && b.input) {
              const cmd = String((b.input as Record<string, unknown>)['command'] ?? '');
              if (cmd.startsWith('cd ') || cmd.startsWith('mkdir ')) {
                const path = cmd.split(/\s+/)[1];
                if (path) {
                  if (!fileChanges.has(path)) fileChanges.set(path, []);
                  const ops = fileChanges.get(path)!;
                  if (!ops.includes('mkdir/cd')) ops.push('mkdir/cd');
                }
              }
            }
          }

          if (b.type === 'text' && typeof b.text === 'string' && b.text.length > 10) {
            const lines = b.text.split('\n').filter((l) => {
              const t = l.trim();
              if (!t || t.startsWith('```') || t.startsWith('#') || t.startsWith('_[') || t.startsWith('>'))
                return false;
              return /^(Fixed|Added|Changed|Updated|Refactored|Created|Removed|Moved|Renamed|Implemented|Resolved|Optimized|Replaced|Extracted|Simplified|Rewrote)/i.test(
                t,
              );
            });
            for (const line of lines.slice(0, 3)) {
              const action = line.replace(/\n/g, ' ').trim().slice(0, DECISION_TRUNCATE);
              if (action.length > 5 && !decisions.includes(action)) decisions.push(action);
            }
          }

          if (b.type === 'tool_result' && b.is_error && typeof b.content === 'string') {
            const errSnippet = b.content.replace(/\n/g, ' ').slice(0, 80).trim();
            if (errSnippet && !errors.includes(errSnippet)) errors.push(errSnippet);
          }
        }
      }
    }

    const summaryParts: string[] = ['[Prior context summary:'];
    summaryParts.push(`  ${totalTurns} conversation turns summarized`);

    if (fileChanges.size > 0) {
      const filesStr = [...fileChanges.entries()]
        .map(([path, ops]) => `${path}(${ops.join(',')})`)
        .join(', ')
        .slice(0, FILE_LIST_TRUNCATE);
      summaryParts.push(`  files: ${filesStr}`);
    }

    if (toolCounts.size > 0) {
      const toolsStr = [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_TOOLS_COUNT)
        .map(([name, count]) => `${name}(${count})`)
        .join(', ');
      summaryParts.push(`  tools: ${toolsStr}`);
    }

    const keyDecisions = decisions.slice(-KEY_DECISIONS_COUNT);
    if (keyDecisions.length > 0) {
      summaryParts.push('  actions:');
      for (const d of keyDecisions) summaryParts.push(`    · ${d}`);
    }

    if (errors.length > 0) {
      summaryParts.push('  errors:');
      for (const e of errors.slice(-3)) summaryParts.push(`    ! ${e}`);
    }

    summaryParts.push(']');

    const result: LLMMessage[] = [];
    result.push({ role: 'user' as const, content: summaryParts.join('\n') });
    result.push(...messages.slice(cutIndex));

    return result.length > 0 ? result : messages;
  }

  /**
   * LLM-based semantic summarization for extremely large contexts (> 400 messages).
   * Uses the model itself to generate a narrative summary.
   */
  async llmSummarizeContext(
    messages: LLMMessage[],
    client: LLMClient,
    model: string,
    maxTokens: number,
  ): Promise<LLMMessage[]> {
    const EXTREME_LIMIT = CONTEXT_SOFT_LIMIT * 2; // 400
    if (messages.length <= EXTREME_LIMIT) return messages;

    const keepRecent = CONTEXT_KEEP_RECENT * 2; // 100
    let cutIndex = messages.length - keepRecent;
    if (cutIndex <= 10) return messages;

    while (cutIndex < messages.length) {
      const m = messages[cutIndex];
      const hasOrphanToolUse =
        m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use');
      const hasOrphanToolResult =
        m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result');
      if (hasOrphanToolUse || hasOrphanToolResult) {
        cutIndex++;
        if (cutIndex >= messages.length) {
          cutIndex = messages.length - 1;
          break;
        }
      } else {
        break;
      }
    }

    if (cutIndex >= messages.length) return messages;

    const toSummarize = messages.slice(0, cutIndex);
    const recent = messages.slice(cutIndex);

    const compactLines: string[] = [];
    for (const m of toSummarize) {
      if (m.role === 'user' && typeof m.content === 'string') {
        const short = m.content.replace(/\n/g, ' ').slice(0, 120).trim();
        if (short && !short.startsWith('[') && !short.startsWith('#')) compactLines.push(`  U: ${short}`);
      }
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'text' && typeof b.text === 'string') {
            const short = b.text.replace(/\n/g, ' ').slice(0, 120).trim();
            if (short && !short.startsWith('[') && !short.startsWith('_[')) compactLines.push(`  A: ${short}`);
          }
          if (b.type === 'tool_use' && b.name) compactLines.push(`  Tool: ${b.name}`);
          if (b.type === 'tool_result' && b.is_error && typeof b.content === 'string') {
            compactLines.push(`  Error: ${b.content.replace(/\n/g, ' ').slice(0, 100)}`);
          }
        }
      }
      if (compactLines.length > 80) {
        compactLines.push('  ... (more history omitted)');
        break;
      }
    }

    if (compactLines.length < 5) return messages;

    const summarizePrompt = [
      'Summarize the following conversation history concisely (2-4 sentences).',
      'Focus on: what was being built/fixed, key decisions made, errors encountered.',
      'Output ONLY the summary, no preamble.',
      '',
      ...compactLines,
    ].join('\n');

    try {
      const response = await client.chat?.({
        model,
        maxTokens: 500,
        messages: [{ role: 'user', content: summarizePrompt }],
        stream: false,
      });
      const summary = response?.content?.trim();
      if (summary && summary.length > 20) {
        return [{ role: 'user', content: `[Prior context summarized by LLM]: ${summary}` }, ...recent];
      }
    } catch (err) {
      logger.debug('[llmSummarizeContext] LLM call failed:', err);
    }

    return messages;
  }

  /**
   * Context window protection: estimate tokens, truncate if approaching limit.
   * Returns the truncated messages array (mutated in place for efficiency).
   */
  truncateIfNeeded(messages: LLMMessage[], maxTokens: number): void {
    const estimatedTokens = estimateMessageTokens(messages);
    const maxCtxTokens = maxTokens * 2;
    if (estimatedTokens > maxCtxTokens * 0.9) {
      const keepCount = Math.max(10, Math.floor(messages.length / 2));
      if (messages.length > keepCount) messages.splice(0, messages.length - keepCount);
    }
  }
}
