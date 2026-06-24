import type { Message, ToolCall, ToolResult } from '../types.js';
import { logger } from '../utils/logger.js';
import type { LLMMessage } from './LLMClient.js';

/** Internal types used for message serialization. */
type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
};

/**
 * Manages conversation history, checkpoints, anti-repetition detection,
 * context summarization, token estimation, and message serialization.
 */
export class ConversationManager {
  private static readonly MAX_CHECKPOINTS = 10;
  private static readonly SIMILARITY_PREFIX_LEN = 100;
  private static readonly MAX_RECENT_TEXTS = 4;
  private static readonly MIN_REPEAT_TEXTS_FOR_FUZZY = 2;
  private static readonly CONTEXT_SOFT_LIMIT = 200;
  private static readonly CONTEXT_KEEP_RECENT = 50;
  private static readonly DECISION_MAX_LEN = 200;
  private static readonly DECISION_TRUNCATE = 150;
  private static readonly FILE_LIST_TRUNCATE = 300;
  private static readonly TOP_TOOLS_COUNT = 10;
  private static readonly KEY_DECISIONS_COUNT = 5;

  private history: LLMMessage[] = [];
  private checkpoints: LLMMessage[][] = [];

  // Anti-repetition: track previous assistant texts (fuzzy dedup)
  private lastAssistantText = '';
  private recentAssistantTexts: string[] = [];
  private repeatCount = 0;

  // Token usage tracking across turns
  private tokenUsage = { inputTokens: 0, outputTokens: 0 };

  constructor() {}

  // ── History access ──────────────────────────────────────────

  getHistory(): LLMMessage[] {
    return this.history;
  }

  setHistory(messages: LLMMessage[]): void {
    this.history = messages;
  }

  getHistoryLength(): number {
    return this.history.length;
  }

  pushToHistory(...messages: LLMMessage[]): void {
    this.history.push(...messages);
  }

  replaceHistory(messages: LLMMessage[]): void {
    this.history.length = 0;
    this.history.push(...messages);
  }

  // ── Token usage ────────────────────────────────────────────

  addTokenUsage(input: number, output: number): void {
    this.tokenUsage.inputTokens += input;
    this.tokenUsage.outputTokens += output;
  }

  getTokenUsage(): { inputTokens: number; outputTokens: number } {
    return { ...this.tokenUsage };
  }

  resetTokenUsage(): void {
    this.tokenUsage = { inputTokens: 0, outputTokens: 0 };
  }

  // ── Checkpoints ────────────────────────────────────────────

  saveCheckpoint(): number {
    const idx = this.checkpoints.length;
    this.checkpoints.push(this.jsonClone(this.history));

    if (this.checkpoints.length > ConversationManager.MAX_CHECKPOINTS) {
      this.checkpoints.shift();
      return idx - 1;
    }
    return idx;
  }

  restoreCheckpoint(): boolean {
    if (this.checkpoints.length === 0) return false;
    const saved = this.checkpoints.pop()!;
    this.history = saved;
    return true;
  }

  get checkpointCount(): number {
    return this.checkpoints.length;
  }

  // ── Anti-repetition ────────────────────────────────────────

  getLastAssistantText(): string {
    return this.lastAssistantText;
  }

  getRecentAssistantTexts(): string[] {
    return this.recentAssistantTexts;
  }

  getRepeatCount(): number {
    return this.repeatCount;
  }

  /**
   * Check if text is near-duplicate of any recent response.
   * Returns true if it's a repeat (similarity > 0).
   */
  computeSimilarity(text: string): number {
    if (this.recentAssistantTexts.length === 0) return 0;
    const prefix = text.slice(0, ConversationManager.SIMILARITY_PREFIX_LEN).toLowerCase();
    for (const prev of this.recentAssistantTexts) {
      if (prev.slice(0, ConversationManager.SIMILARITY_PREFIX_LEN).toLowerCase() === prefix) return 1.0;
    }
    return 0;
  }

  /**
   * Record an assistant text for anti-repetition tracking.
   * Returns true if it's a detected repeat (exact match with last text).
   */
  recordAssistantText(text: string): { isExactRepeat: boolean; isFuzzyRepeat: boolean } {
    const isExactRepeat = text === this.lastAssistantText;
    const isFuzzyRepeat = !isExactRepeat && this.computeSimilarity(text) > 0;

    if (isExactRepeat) {
      this.repeatCount++;
    } else {
      this.repeatCount = 0;
    }

    this.lastAssistantText = text;
    this.recentAssistantTexts.push(text);
    if (this.recentAssistantTexts.length > ConversationManager.MAX_RECENT_TEXTS) {
      this.recentAssistantTexts.shift();
    }

    return {
      isExactRepeat,
      isFuzzyRepeat:
        isFuzzyRepeat && this.recentAssistantTexts.length >= ConversationManager.MIN_REPEAT_TEXTS_FOR_FUZZY,
    };
  }

  resetAntiRepetitionState(): void {
    this.lastAssistantText = '';
    this.recentAssistantTexts = [];
    this.repeatCount = 0;
  }

  // ── Deep clone ──────────────────────────────────────────────

  jsonClone<T>(obj: T): T {
    if (obj === undefined) return undefined as T;
    if (obj === null || typeof obj !== 'object') return obj;

    try {
      return structuredClone(obj);
    } catch {
      // structuredClone failed — fallback to JSON round-trip
    }

    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[ConversationManager] jsonClone failed: ${msg}. Cannot deep copy object.`);
    }
  }

  // ── Token estimation ───────────────────────────────────────

  estimateMessageTokens(messages: LLMMessage[]): number {
    let total = 0;
    for (const m of messages) {
      if (typeof m.content === 'string') {
        total += m.content.length;
      } else if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if ('text' in b && typeof b.text === 'string') total += b.text.length;
          if ('content' in b && typeof b.content === 'string') total += b.content.length;
          if ('input' in b && typeof b.input === 'object') total += JSON.stringify(b.input).length;
        }
      }
    }
    return Math.ceil(total / 4);
  }

  // ── Context summarization ──────────────────────────────────

  summarizeContext(messages: LLMMessage[]): LLMMessage[] {
    logger.debug(
      `[summarizeContext] input length: ${messages.length}, SOFT_LIMIT: ${ConversationManager.CONTEXT_SOFT_LIMIT}`,
    );
    if (messages.length <= ConversationManager.CONTEXT_SOFT_LIMIT) {
      logger.debug(`[summarizeContext] returning ${messages.length} messages unchanged`);
      return messages;
    }

    let cutIndex = messages.length - ConversationManager.CONTEXT_KEEP_RECENT;

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
    const modifiedFiles = new Set<string>();
    const decisions: string[] = [];
    const toolCounts = new Map<string, number>();
    let totalUserMsgs = 0;

    for (const m of toSummarize) {
      if (m.role === 'user' && typeof m.content === 'string' && m.content.length > 0) {
        totalUserMsgs++;
        if (m.content.length < ConversationManager.DECISION_MAX_LEN && !m.content.startsWith('[')) {
          decisions.push(m.content.replace(/\n/g, ' ').slice(0, ConversationManager.DECISION_TRUNCATE));
        }
      }
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'tool_use' && b.name) {
            toolCounts.set(b.name, (toolCounts.get(b.name) || 0) + 1);
            if ((b.name === 'Write' || b.name === 'Edit') && b.input) {
              const path = String((b.input as Record<string, unknown>)['filePath'] ?? '');
              if (path) modifiedFiles.add(path);
            }
            if (b.name === 'Bash' && b.input) {
              const cmd = String((b.input as Record<string, unknown>)['command'] ?? '');
              if (cmd.startsWith('cd ') || cmd.startsWith('mkdir ')) {
                const path = cmd.split(/\s+/)[1];
                if (path) modifiedFiles.add(path);
              }
            }
          }
        }
      }
    }

    const summaryParts: string[] = ['[Prior context summary:'];
    if (totalUserMsgs > 0) summaryParts.push(`  assistant responded to ${totalUserMsgs} user messages`);
    if (modifiedFiles.size > 0) {
      summaryParts.push(
        `  files modified: ${[...modifiedFiles].join(', ').slice(0, ConversationManager.FILE_LIST_TRUNCATE)}`,
      );
    }
    if (toolCounts.size > 0) {
      const toolsStr = [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, ConversationManager.TOP_TOOLS_COUNT)
        .map(([name, count]) => `${name}(${count})`)
        .join(', ');
      summaryParts.push(`  tools used: ${toolsStr}`);
    }
    const keyDecisions = decisions.slice(-ConversationManager.KEY_DECISIONS_COUNT);
    if (keyDecisions.length > 0) {
      summaryParts.push('  key requests:');
      for (const d of keyDecisions) summaryParts.push(`    · ${d}`);
    }
    summaryParts.push(']');

    const recent = messages.slice(cutIndex);
    const result: LLMMessage[] = [];
    result.push({ role: 'user' as const, content: summaryParts.join('\n') });
    result.push(...recent);

    if (result.length === 0) {
      return messages;
    }

    return result;
  }

  // ── Serialization ──────────────────────────────────────────

  exportMessages(): Message[] {
    return this.history.map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: m.content };
      }

      const blocks = m.content as (AssistantContentBlock | ToolResultBlock)[];

      const textParts = blocks
        .filter((b): b is AssistantContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const toolUseParts = blocks
        .filter((b): b is AssistantContentBlock & { type: 'tool_use' } => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          name: b.name,
          args: b.input as Record<string, unknown>,
        }));

      const toolResultParts = blocks
        .filter((b): b is ToolResultBlock => b.type === 'tool_result')
        .map((b) => ({
          tool: b.tool_use_id,
          input: {} as Record<string, unknown>,
          output: b.content,
          isError: b.is_error === true,
        }));

      return {
        role: m.role,
        content: textParts,
        toolCalls: toolUseParts.length > 0 ? (toolUseParts as ToolCall[]) : undefined,
        toolResults: toolResultParts.length > 0 ? (toolResultParts as ToolResult[]) : undefined,
      };
    });
  }

  loadMessages(msgs: Message[]): void {
    // Reset anti-repetition state when loading a new session
    this.resetAntiRepetitionState();

    for (const m of msgs) {
      if (m.role === 'user') {
        if (m.toolResults && m.toolResults.length > 0) {
          const blocks: ToolResultBlock[] = m.toolResults.map((tr) => ({
            type: 'tool_result',
            tool_use_id: tr.tool || 'unknown',
            content: tr.output,
            is_error: tr.isError,
          }));
          this.history.push({ role: 'user', content: blocks });
        } else {
          this.history.push({ role: 'user', content: m.content });
        }
      } else if (m.role === 'assistant') {
        const blocks: AssistantContentBlock[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
          }
        }
        this.history.push({ role: 'assistant', content: blocks });
      }
    }
  }

  // ── Reset ──────────────────────────────────────────────────

  reset(): void {
    this.history = [];
    this.checkpoints = [];
    this.resetAntiRepetitionState();
    this.resetTokenUsage();
  }
}
