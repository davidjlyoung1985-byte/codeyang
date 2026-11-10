import { describe, it, expect } from 'vitest';
import { AgentContextManager } from './AgentContextManager.js';
import { getContextWindow, getInputBudget, DEFAULT_CONTEXT_WINDOW } from './model-limits.js';
import type { LLMMessage } from './LLMClient.js';

function makeManager(): AgentContextManager {
  return new AgentContextManager(async () => null);
}

/** Build a long transcript with alternating user/assistant text turns. */
function makeTranscript(turns: number, charsPerMsg = 400): LLMMessage[] {
  const msgs: LLMMessage[] = [];
  for (let i = 0; i < turns; i++) {
    const filler = 'x'.repeat(charsPerMsg);
    msgs.push({ role: 'user', content: `turn ${i} request ${filler}` });
    msgs.push({ role: 'assistant', content: [{ type: 'text', text: `turn ${i} reply ${filler}` }] });
  }
  return msgs;
}

describe('model-limits', () => {
  it('maps known model families to their context windows', () => {
    expect(getContextWindow('claude-sonnet-4-5')).toBe(200_000);
    expect(getContextWindow('deepseek-chat')).toBe(128_000);
    expect(getContextWindow('gpt-4o')).toBe(128_000);
    expect(getContextWindow('gemini-2.5-pro')).toBe(1_000_000);
  });

  it('strips provider prefixes before matching', () => {
    expect(getContextWindow('anthropic/claude-opus-4-1')).toBe(200_000);
    expect(getContextWindow('openai/gpt-4o-mini')).toBe(128_000);
  });

  it('falls back to a conservative default for unknown models', () => {
    expect(getContextWindow('some-unknown-model-xyz')).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(getContextWindow('')).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it('reserves output tokens from the input budget', () => {
    const budget200k = getInputBudget('claude-sonnet-4-5', 8192);
    // 200k * 0.8 - 8192
    expect(budget200k).toBe(Math.floor(200_000 * 0.8) - 8192);
    expect(budget200k).toBeLessThan(200_000);
  });

  it('never starves the input budget when output is set absurdly high', () => {
    const budget = getInputBudget('deepseek-chat', 999_999_999);
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeGreaterThanOrEqual(Math.floor(128_000 * 0.25));
  });
});

describe('AgentContextManager.truncateIfNeeded', () => {
  it('leaves short conversations untouched', () => {
    const mgr = makeManager();
    const messages = makeTranscript(3, 20);
    const before = messages.length;

    const changed = mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    expect(changed).toBe(false);
    expect(messages.length).toBe(before);
  });

  it('does not treat the output maxTokens as the whole context window', () => {
    const mgr = makeManager();
    // ~6k tokens of history: far below a 200k window, but well above the old
    // buggy budget of maxTokens * 2 * 0.9 === 14_745 tokens.
    const messages = makeTranscript(40, 600);

    const changed = mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    // 200k window -> nothing should be dropped.
    expect(changed).toBe(false);
  });

  it('truncates once the real window is exceeded', () => {
    const mgr = makeManager();
    // ~1.2M chars of CJK-free filler -> roughly 300k tokens, over a 200k window.
    const messages = makeTranscript(2000, 600);
    const originalLength = messages.length;

    const changed = mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    expect(changed).toBe(true);
    expect(messages.length).toBeLessThan(originalLength);
  });

  it('replaces the dropped span with a summary that restates the original task', () => {
    const mgr = makeManager();
    const messages = makeTranscript(2000, 600);
    messages[0] = { role: 'user', content: 'Refactor the auth module to use JWT tokens' };

    mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    expect(messages[0].role).toBe('user');
    const head = String(messages[0].content);
    expect(head).toContain('[Prior context summary:');
    expect(head).toContain('task: Refactor the auth module to use JWT tokens');
  });

  it('never keeps a tool_result whose tool_use was dropped', () => {
    const mgr = makeManager();
    const messages: LLMMessage[] = [{ role: 'user', content: 'do the thing' }];
    // Build many tool-call rounds; each pair crosses an assistant/user boundary.
    for (let i = 0; i < 1500; i++) {
      const id = `toolu_${i}`;
      messages.push({
        role: 'assistant',
        content: [
          { type: 'text', text: 'working '.repeat(40) },
          { type: 'tool_use', id, name: 'Read', input: { filePath: `/tmp/f${i}.ts` } },
        ],
      });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: id, content: 'y'.repeat(400) }],
      });
    }

    mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    // Collect all tool_use ids that survived, and every tool_result id.
    const survivingToolUses = new Set<string>();
    const survivingToolResults: string[] = [];
    for (const m of messages) {
      if (!Array.isArray(m.content)) continue;
      for (const b of m.content) {
        if (b.type === 'tool_use' && b.id) survivingToolUses.add(b.id);
        if (b.type === 'tool_result' && b.tool_use_id) survivingToolResults.push(b.tool_use_id);
      }
    }

    expect(survivingToolResults.length).toBeGreaterThan(0);
    for (const id of survivingToolResults) {
      expect(survivingToolUses.has(id)).toBe(true);
    }
  });

  it('keeps the most recent message (the current turn)', () => {
    const mgr = makeManager();
    const messages = makeTranscript(2000, 600);
    const last = messages[messages.length - 1];

    mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    expect(messages[messages.length - 1]).toEqual(last);
  });

  it('shrinks drastically for a small-window model', () => {
    const mgr = makeManager();
    const big = makeTranscript(400, 600);
    const small = makeTranscript(400, 600);

    const changedBig = mgr.truncateIfNeeded(big, 'claude-sonnet-4-5', 8192);
    const changedSmall = mgr.truncateIfNeeded(small, 'my-tiny-custom-model', 8192);

    // Same payload: fits the 200k window, does not fit the 128k default.
    expect(changedBig).toBe(false);
    expect(changedSmall).toBe(true);
  });

  it('is idempotent: a second pass over a trimmed transcript is a no-op', () => {
    const mgr = makeManager();
    const messages = makeTranscript(2000, 600);

    expect(mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192)).toBe(true);
    const afterFirst = messages.length;
    const secondPass = mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    expect(secondPass).toBe(false);
    expect(messages.length).toBe(afterFirst);
  });

  it('does not re-summarize an existing summary into itself', () => {
    const mgr = makeManager();
    const messages = makeTranscript(2000, 600);
    messages[0] = { role: 'user', content: 'original task text here' };

    mgr.truncateIfNeeded(messages, 'claude-sonnet-4-5', 8192);

    const head = String(messages[0].content);
    // The anchor task is carried through, not the synthetic summary wrapper.
    expect(head).toContain('original task text here');
    expect(head.match(/\[Prior context summary:/g)?.length ?? 0).toBe(1);
  });
});

describe('AgentContextManager.summarizeContext', () => {
  it('summarizes by message count and reuses the shared builder', () => {
    const mgr = makeManager();
    const messages = makeTranscript(150); // 300 messages > CONTEXT_SOFT_LIMIT(200)

    const result = mgr.summarizeContext(messages);

    expect(result.length).toBeLessThan(messages.length);
    expect(String(result[0].content)).toContain('[Prior context summary:');
  });

  it('is a no-op below the soft limit', () => {
    const mgr = makeManager();
    const messages = makeTranscript(10);
    expect(mgr.summarizeContext(messages)).toBe(messages);
  });
});
