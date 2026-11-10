import { describe, it, expect, afterEach } from 'vitest';
import {
  applyMessageCache,
  applyToolCache,
  buildCachedSystem,
  getPromptCacheOptions,
  stripCacheControl,
  type PromptCacheOptions,
} from './prompt-cache.js';
import type { LLMMessage, ToolSchema } from './LLMClient.js';

const ON: PromptCacheOptions = { enabled: true, cacheMessages: true };
const OFF: PromptCacheOptions = { enabled: false, cacheMessages: false };

function tool(name: string): ToolSchema {
  return { name, description: `desc ${name}`, input_schema: { type: 'object', properties: {} } };
}

function textTurn(role: 'user' | 'assistant', text: string): LLMMessage {
  return { role, content: text };
}

describe('getPromptCacheOptions', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is enabled by default', () => {
    delete process.env['CODEYANG_PROMPT_CACHE'];
    expect(getPromptCacheOptions().enabled).toBe(true);
  });

  it.each(['off', 'false', '0', 'OFF'])('can be disabled with CODEYANG_PROMPT_CACHE=%s', (v) => {
    process.env['CODEYANG_PROMPT_CACHE'] = v;
    expect(getPromptCacheOptions().enabled).toBe(false);
  });

  it('lets message-level caching be disabled independently', () => {
    delete process.env['CODEYANG_PROMPT_CACHE'];
    process.env['CODEYANG_PROMPT_CACHE_MESSAGES'] = 'off';
    const opts = getPromptCacheOptions();
    expect(opts.enabled).toBe(true);
    expect(opts.cacheMessages).toBe(false);
  });

  it('propagates the 1h TTL', () => {
    process.env['CODEYANG_PROMPT_CACHE_TTL'] = '1h';
    expect(getPromptCacheOptions().ttl).toBe('1h');
  });
});

describe('buildCachedSystem', () => {
  it('returns plain string when caching is off', () => {
    expect(buildCachedSystem('prompt', OFF)).toBe('prompt');
  });

  it('wraps the prompt in a single cached text block', () => {
    const out = buildCachedSystem('prompt', ON);
    expect(Array.isArray(out)).toBe(true);
    const blocks = out as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('prompt');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('includes the ttl when configured', () => {
    const out = buildCachedSystem('p', { ...ON, ttl: '1h' }) as Array<{ cache_control?: unknown }>;
    expect(out[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('handles an empty prompt without inventing a block', () => {
    expect(buildCachedSystem('', ON)).toBe('');
  });
});

describe('applyToolCache', () => {
  it('does not mutate the input array', () => {
    const tools = [tool('A'), tool('B')];
    const out = applyToolCache(tools, ON);
    expect(tools[1]).not.toHaveProperty('cache_control');
    expect(out).not.toBe(tools);
  });

  it('puts a breakpoint only on the last tool', () => {
    const out = applyToolCache([tool('A'), tool('B'), tool('C')], ON);
    expect(out[0]).not.toHaveProperty('cache_control');
    expect(out[1]).not.toHaveProperty('cache_control');
    expect(out[2].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('skips a single-tool array (prefix too small to matter)', () => {
    const out = applyToolCache([tool('Only')], ON);
    expect(out[0]).not.toHaveProperty('cache_control');
  });

  it('is a no-op when disabled', () => {
    const tools = [tool('A'), tool('B')];
    expect(applyToolCache(tools, OFF)).toBe(tools);
  });
});

describe('applyMessageCache', () => {
  it('is a no-op when disabled', () => {
    const msgs = [textTurn('user', 'a'), textTurn('assistant', 'b'), textTurn('user', 'c')];
    expect(applyMessageCache(msgs, OFF)).toBe(msgs);
  });

  it('is a no-op when message caching is off but system caching is on', () => {
    const msgs = [textTurn('user', 'a'), textTurn('assistant', 'b'), textTurn('user', 'c')];
    const opts: PromptCacheOptions = { enabled: true, cacheMessages: false };
    expect(applyMessageCache(msgs, opts)).toBe(msgs);
  });

  it('puts the breakpoint on the second-to-last message so the next turn hits cache', () => {
    const msgs = [textTurn('user', 'turn1'), textTurn('assistant', 'reply1'), textTurn('user', 'turn2')];
    const out = applyMessageCache(msgs, ON);

    // index 1 (reply1) gets the breakpoint; the live turn (index 2) does not.
    expect(Array.isArray(out[1].content)).toBe(true);
    const block = (out[1].content as Array<{ cache_control?: unknown }>)[0];
    expect(block.cache_control).toEqual({ type: 'ephemeral' });

    const liveBlock = (out[2].content as unknown as string) ?? '';
    expect(typeof msgs[2].content === 'string' ? msgs[2].content : liveBlock).toBe('turn2');
  });

  it('converts string content to a text block so the field can be attached', () => {
    const msgs = [textTurn('user', 'a'), textTurn('assistant', 'b'), textTurn('user', 'c')];
    const out = applyMessageCache(msgs, ON);
    expect(typeof out[1].content).not.toBe('string');
  });

  it('does not mutate the original message objects', () => {
    const msgs = [textTurn('user', 'a'), textTurn('assistant', 'b'), textTurn('user', 'c')];
    applyMessageCache(msgs, ON);
    expect(typeof msgs[1].content).toBe('string');
  });

  it('skips assistant messages that hold only tool_use blocks', () => {
    const msgs: LLMMessage[] = [
      textTurn('user', 'go'),
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { filePath: 'x' } }],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
    ];
    const out = applyMessageCache(msgs, ON);

    const assistantBlocks = out[1].content as Array<{ cache_control?: unknown }>;
    expect(assistantBlocks[0].cache_control).toBeUndefined();
    // Falls back to the first user message instead.
    const userBlocks = out[0].content as Array<{ cache_control?: unknown }>;
    expect(userBlocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('returns the input untouched when there is only one message', () => {
    const msgs = [textTurn('user', 'only')];
    expect(applyMessageCache(msgs, ON)).toBe(msgs);
  });
});

describe('stripCacheControl', () => {
  it('removes cache_control at every nesting level', () => {
    const payload = {
      model: 'claude',
      system: [{ type: 'text', text: 'p', cache_control: { type: 'ephemeral' } }],
      tools: [{ name: 'A', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x', cache_control: { type: 'ephemeral' } }] }],
    };

    const clean = stripCacheControl(payload);
    const json = JSON.stringify(clean);

    expect(json).not.toContain('cache_control');
    // Everything else survives.
    expect(clean.model).toBe('claude');
    expect(clean.messages[0].content[0].text).toBe('x');
  });

  it('leaves cache_read_token style usage numbers alone', () => {
    const usage = { input_tokens: 10, cache_read_input_tokens: 900 };
    expect(stripCacheControl(usage)).toEqual(usage);
  });
});
