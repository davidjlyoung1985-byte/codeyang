/**
 * Prompt caching (Anthropic `cache_control`).
 *
 * The agent resends a large stable prefix on every turn: the system prompt, the
 * learned-pattern block, and ~80 tool schemas. Without caching that prefix is
 * billed at full input price on every request.
 *
 * Anthropic caches by *prefix*: the longest previously-written prefix that
 * matches the current request is read from cache (10% of input price); anything
 * past it is billed normally and, if a new breakpoint lands there, written once
 * at 125%.
 *
 * Cache prefix order for Anthropic is: `tools` → `system` → `messages`.
 * So a breakpoint on the last system block already covers tools + system.
 *
 * We use at most 2 breakpoints (the API allows 4):
 *   1. last system block   — stable for the whole session
 *   2. rolling message     — second-to-last message, so the newest turn appends
 *
 * Minimum cacheable prefix is 1024 tokens (2048 for Haiku). Short prompts
 * silently don't cache; that is harmless, not an error.
 */
import type { LLMMessage, ToolSchema } from './LLMClient.js';

export interface CacheControl {
  type: 'ephemeral';
  /** Optional explicit TTL; omitted means the provider default (5m). */
  ttl?: '5m' | '1h';
}

/** Shape of a system content block once cache_control is attached. */
export interface CachedTextBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

/** Tool schema with an optional cache breakpoint. */
export type CachedToolSchema = ToolSchema & { cache_control?: CacheControl };

export interface PromptCacheOptions {
  /** Master switch. Disabled entirely when false. */
  enabled: boolean;
  /** Also write a rolling breakpoint into the message history. */
  cacheMessages: boolean;
  ttl?: '5m' | '1h';
}

/**
 * Resolve options from the environment.
 *
 * Anthropic-compatible endpoints (DeepSeek, some proxies) ignore unknown block
 * fields, and non-Anthropic providers get caching for free, so this is opt-out
 * rather than opt-in — but safe to disable with CODEYANG_PROMPT_CACHE=off.
 */
export function getPromptCacheOptions(): PromptCacheOptions {
  const flag = (process.env['CODEYANG_PROMPT_CACHE'] ?? '').trim().toLowerCase();
  const enabled = flag !== 'off' && flag !== 'false' && flag !== '0';
  const messagesFlag = (process.env['CODEYANG_PROMPT_CACHE_MESSAGES'] ?? '').trim().toLowerCase();
  const ttl = process.env['CODEYANG_PROMPT_CACHE_TTL'] === '1h' ? '1h' : undefined;

  return {
    enabled,
    cacheMessages: enabled && messagesFlag !== 'off' && messagesFlag !== 'false' && messagesFlag !== '0',
    ttl,
  };
}

function cacheControl(ttl?: '5m' | '1h'): CacheControl {
  return ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}

/**
 * Wrap the system prompt into blocks with a breakpoint on the last block.
 * A single-block array is what the Anthropic API expects for caching.
 */
export function buildCachedSystem(systemPrompt: string, opts: PromptCacheOptions): CachedTextBlock[] | string {
  if (!opts.enabled || !systemPrompt) return systemPrompt;
  return [{ type: 'text', text: systemPrompt, cache_control: cacheControl(opts.ttl) }];
}

/**
 * Put a breakpoint on the final tool so the whole tools array is cacheable.
 *
 * Only worth doing when there is more than one tool: a lone tool is a tiny
 * prefix and would be covered by the system breakpoint anyway.
 */
export function applyToolCache(tools: ToolSchema[], opts: PromptCacheOptions): CachedToolSchema[] {
  if (!opts.enabled || tools.length < 2) return tools;
  const out: CachedToolSchema[] = tools.slice();
  out[out.length - 1] = { ...out[out.length - 1], cache_control: cacheControl(opts.ttl) };
  return out;
}

/**
 * Attach a rolling breakpoint to the second-to-last message.
 *
 * Placing it one turn behind the head means the next request (which appends a
 * new message) still matches the cached prefix, giving a read instead of a write.
 *
 * Mutates nothing: returns new message objects only where a breakpoint is added.
 */
export function applyMessageCache(messages: LLMMessage[], opts: PromptCacheOptions): LLMMessage[] {
  if (!opts.enabled || !opts.cacheMessages) return messages;
  // Need at least 2 messages: the last one is the live turn.
  const targetIndex = messages.length - 2;
  if (targetIndex < 1) return messages;

  // Never attach cache_control to an assistant message that only holds
  // tool_use blocks — some gateways reject it, and the preceding user message
  // is a better boundary anyway. Step back until we find a text-bearing block.
  let idx = targetIndex;
  while (idx >= 0 && messages[idx].role === 'assistant' && !hasTextContent(messages[idx])) {
    idx--;
  }
  if (idx < 0) return messages;

  const patched = withBreakpoint(messages[idx], opts.ttl);
  if (patched === messages[idx]) return messages;

  const out = messages.slice();
  out[idx] = patched;
  return out;
}

function hasTextContent(m: LLMMessage): boolean {
  if (typeof m.content === 'string') return m.content.length > 0;
  return m.content.some((b) => b.type === 'text');
}

/**
 * Return a copy of `m` with cache_control on its final content block.
 * String content is converted to a single text block (required by the API).
 */
function withBreakpoint(m: LLMMessage, ttl?: '5m' | '1h'): LLMMessage {
  const cc = cacheControl(ttl);

  if (typeof m.content === 'string') {
    if (!m.content) return m;
    return { role: m.role, content: [{ type: 'text', text: m.content, cache_control: cc }] };
  }

  if (m.content.length === 0) return m;

  const blocks = m.content.slice();
  const lastIdx = blocks.length - 1;
  // tool_result blocks accept cache_control too, so only skip empty blocks.
  const last = blocks[lastIdx];
  if (!last) return m;

  blocks[lastIdx] = { ...last, cache_control: cc };
  return { role: m.role, content: blocks };
}

/**
 * Strip every `cache_control` from a message list.
 *
 * Used as a fallback when an upstream proxy rejects the field: retrying with a
 * clean payload beats failing the whole request.
 */
export function stripCacheControl<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripCacheControl(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'cache_control') continue;
      out[k] = stripCacheControl(v);
    }
    return out as unknown as T;
  }
  return value;
}
