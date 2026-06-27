/**
 * Agent utilities — pure helper functions used by the Agent.
 */
import type { LLMMessage } from './LLMClient.js';
import { logger } from '../utils/logger.js';

// ── Constants ──────────────────────────────────────────────

export const SIMILARITY_PREFIX_LEN = 100;
export const MAX_RETRY_DELAY_MS = 30_000;
export const MAX_SAFE_CLONE_SIZE = 100 * 1024 * 1024; // 100MB

// ── Error sanitization ─────────────────────────────────────

/** Sanitize error messages to prevent API key leaks. */
export function sanitizeErrorMessage(msg: string): string {
  return msg.replace(/\b(sk-|deepseek-r-|anthropic-)[a-zA-Z0-9_-]{10,}\b/gi, '[API_KEY_REDACTED]');
}

// ── Sleep ──────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Retry ──────────────────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number,
  onError?: (err: string) => void,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err instanceof Error &&
        (err.message.includes('rate_limit') ||
          err.message.includes('Rate exceeded') ||
          err.message.includes('429') ||
          err.message.includes('529') ||
          err.message.includes('server error') ||
          err.message.includes('503') ||
          err.message.includes('timeout') ||
          err.message.includes('network') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('ETIMEDOUT'));

      if (attempt < maxRetries && isRetryable) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
        const delayStr = delay >= 1000 ? `${(delay / 1000).toFixed(1)}s` : `${delay}ms`;
        onError?.(
          `⚠️ ${label} failed (attempt ${attempt}/${maxRetries})\n` +
            `  💡 Retrying in ${delayStr}...\n` +
            `  📝 Reason: ${err.message}`,
        );
        await sleep(delay);
        continue;
      }

      if (isRetryable) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `🔴 ${label} failed after ${maxRetries} attempts\n` +
            `  💡 Last error: ${sanitizeErrorMessage(errMsg)}\n` +
            `  📝 Try:\n` +
            `    1) Check your network connection\n` +
            `    2) Verify API endpoint is accessible\n` +
            `    3) Check API key and rate limits\n` +
            `    4) Wait a moment and retry manually`,
        );
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after ${maxRetries} attempts`);
}

// ── Deep clone ─────────────────────────────────────────────

/**
 * Deep clone an object with OOM protection.
 * Uses structuredClone (Node 17+), falls back to JSON round-trip.
 */
export function jsonClone<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (estimateObjectSize(obj) > MAX_SAFE_CLONE_SIZE) {
    if (Array.isArray(obj)) return [...obj] as T;
    return { ...obj } as T;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch (err) {
      if (process.env.CODEYANG_DEBUG) {
        console.warn('[AgentUtils] structuredClone failed, using JSON fallback:', err);
      }
    }
  }

  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (err) {
    throw new Error(`[AgentUtils] jsonClone failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Rough estimate of object size in bytes (prevents OOM on large clones).
 */
export function estimateObjectSize(obj: unknown): number {
  if (obj === null || obj === undefined) return 0;
  if (typeof obj === 'string') return obj.length * 2;
  if (typeof obj === 'number') return 8;
  if (typeof obj === 'boolean') return 4;
  if (typeof obj !== 'object') return 0;

  let size = 0;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      size += estimateObjectSize(item);
      if (size > MAX_SAFE_CLONE_SIZE) return size;
    }
  } else {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      size += estimateObjectSize(value);
      if (size > MAX_SAFE_CLONE_SIZE) return size;
    }
  }
  return size;
}

// ── Tool cache key ─────────────────────────────────────────

/** Generate a cache key from tool name + arguments. */
export function cacheKey(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

// ── Text similarity (anti-repetition) ──────────────────────

/**
 * Compute prefix similarity of a text against a list of recent texts.
 * Returns 1.0 if the prefix (first N chars) matches any recent text.
 */
export function computeSimilarity(text: string, recentTexts: string[], prefixLen: number): number {
  if (recentTexts.length === 0) return 0;
  const prefix = text.slice(0, prefixLen).toLowerCase();
  for (const prev of recentTexts) {
    if (prev.slice(0, prefixLen).toLowerCase() === prefix) return 1.0;
  }
  return 0;
}

// ── Token estimation ───────────────────────────────────────

/**
 * Estimate token count for an array of LLM messages.
 * Uses a char-class-aware heuristic: English words, CJK chars, digits, symbols.
 */
export function estimateMessageTokens(messages: LLMMessage[]): number {
  let total = 0;

  const estimateString = (s: string) => {
    if (!s) return;
    let cjkChars = 0;
    let digits = 0;
    let alphaChars = 0;
    let otherChars = 0;

    for (const ch of s) {
      const code = ch.charCodeAt(0);
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3000 && code <= 0x303f) ||
        (code >= 0x3400 && code <= 0x4dbf)
      ) {
        cjkChars++;
      } else if (ch >= '0' && ch <= '9') {
        digits++;
      } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
        alphaChars++;
      } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        // whitespace — skip
      } else {
        otherChars++;
      }
    }

    // English: ~5 letters/word, 1.3 tokens/word
    total += (alphaChars / 5) * 1.3;
    // CJK: ~1.5 chars/token
    total += cjkChars / 1.5;
    // Digits: ~3 chars/token
    total += digits / 3;
    // Symbols/code: ~2 chars/token
    total += otherChars / 2;
  };

  for (const m of messages) {
    if (typeof m.content === 'string') {
      estimateString(m.content);
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if ('text' in b && typeof b.text === 'string') estimateString(b.text);
        if ('content' in b && typeof b.content === 'string') estimateString(b.content);
        if ('input' in b && typeof b.input === 'object') estimateString(JSON.stringify(b.input));
      }
    }
  }

  // 5% safety margin
  return Math.ceil(total * 1.05);
}

/**
 * Check if text is a near-duplicate of the last assistant text (exact repeat guard).
 */
export function checkExactRepeat(
  currentText: string,
  lastText: string,
  repeatCount: number,
  maxRepeats: number,
): { isRepeat: boolean; newRepeatCount: number } {
  if (!currentText) return { isRepeat: false, newRepeatCount: repeatCount };
  if (currentText === lastText) {
    const newCount = repeatCount + 1;
    return { isRepeat: newCount >= maxRepeats, newRepeatCount: newCount };
  }
  return { isRepeat: false, newRepeatCount: 0 };
}

/**
 * Check if text is a fuzzy duplicate (prefix match against recent texts).
 */
export function checkFuzzyRepeat(
  text: string,
  recentTexts: string[],
  minTextsForFuzzy: number,
  prefixLen: number,
): boolean {
  if (recentTexts.length < minTextsForFuzzy) return false;
  return computeSimilarity(text, recentTexts, prefixLen) > 0;
}
