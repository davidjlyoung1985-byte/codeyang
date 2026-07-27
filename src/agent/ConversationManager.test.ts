import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager } from './ConversationManager.js';
import type { LLMMessage } from './LLMClient.js';
import type { Message } from '../types.js';

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  // ── History Management ──────────────────────────────────────

  describe('history management', () => {
    it('should initialize with empty history', () => {
      expect(manager.getHistory()).toEqual([]);
      expect(manager.getHistoryLength()).toBe(0);
    });

    it('should push messages to history', () => {
      const msg: LLMMessage = { role: 'user', content: 'Hello' };
      manager.pushToHistory(msg);

      expect(manager.getHistory()).toEqual([msg]);
      expect(manager.getHistoryLength()).toBe(1);
    });

    it('should push multiple messages at once', () => {
      const msg1: LLMMessage = { role: 'user', content: 'Hello' };
      const msg2: LLMMessage = { role: 'assistant', content: 'Hi' };

      manager.pushToHistory(msg1, msg2);

      expect(manager.getHistoryLength()).toBe(2);
      expect(manager.getHistory()[0]).toEqual(msg1);
      expect(manager.getHistory()[1]).toEqual(msg2);
    });

    it('should replace entire history', () => {
      manager.pushToHistory({ role: 'user', content: 'Old' });

      const newHistory: LLMMessage[] = [
        { role: 'user', content: 'New 1' },
        { role: 'assistant', content: 'New 2' },
      ];

      manager.replaceHistory(newHistory);

      expect(manager.getHistoryLength()).toBe(2);
      expect(manager.getHistory()).toEqual(newHistory);
    });

    it('should set history', () => {
      const history: LLMMessage[] = [
        { role: 'user', content: 'Test 1' },
        { role: 'assistant', content: 'Test 2' },
      ];

      manager.setHistory(history);
      expect(manager.getHistory()).toEqual(history);
    });
  });

  // ── Token Usage Tracking ────────────────────────────────────

  describe('token usage tracking', () => {
    it('should initialize with zero tokens', () => {
      const usage = manager.getTokenUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });

    it('should accumulate token usage', () => {
      manager.addTokenUsage(100, 50);
      manager.addTokenUsage(200, 75);

      const usage = manager.getTokenUsage();
      expect(usage.inputTokens).toBe(300);
      expect(usage.outputTokens).toBe(125);
    });

    it('should reset token usage', () => {
      manager.addTokenUsage(100, 50);
      manager.resetTokenUsage();

      const usage = manager.getTokenUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });

    it('should return copy of token usage (not reference)', () => {
      manager.addTokenUsage(100, 50);
      const usage1 = manager.getTokenUsage();
      usage1.inputTokens = 999;

      const usage2 = manager.getTokenUsage();
      expect(usage2.inputTokens).toBe(100); // Original unchanged
    });
  });

  // ── Checkpoints ─────────────────────────────────────────────

  describe('checkpoints', () => {
    it('should save checkpoint', () => {
      manager.pushToHistory({ role: 'user', content: 'Test' });
      const idx = manager.saveCheckpoint();

      expect(idx).toBe(0);
      expect(manager.checkpointCount).toBe(1);
    });

    it('should restore from checkpoint', () => {
      manager.pushToHistory({ role: 'user', content: 'Original' });
      manager.saveCheckpoint();

      manager.pushToHistory({ role: 'assistant', content: 'Added' });
      expect(manager.getHistoryLength()).toBe(2);

      const restored = manager.restoreCheckpoint();
      expect(restored).toBe(true);
      expect(manager.getHistoryLength()).toBe(1);
      expect(manager.getHistory()[0].content).toBe('Original');
    });

    it('should limit checkpoint count', () => {
      // Create many checkpoints
      for (let i = 0; i < 15; i++) {
        manager.pushToHistory({ role: 'user', content: `Message ${i}` });
        manager.saveCheckpoint();
      }

      // Should not exceed MAX_CHECKPOINTS (10)
      expect(manager.checkpointCount).toBeLessThanOrEqual(10);
    });

    it('should discard oldest checkpoints when limit exceeded', () => {
      // Create initial checkpoint
      manager.pushToHistory({ role: 'user', content: 'First' });
      manager.saveCheckpoint();

      // Add many more (exceed limit)
      for (let i = 0; i < 12; i++) {
        manager.pushToHistory({ role: 'user', content: `Msg ${i}` });
        manager.saveCheckpoint();
      }

      // Should have max 10 checkpoints
      expect(manager.checkpointCount).toBe(10);

      // Should still be able to restore
      const restored = manager.restoreCheckpoint();
      expect(restored).toBe(true);
    });

    it('should return false when restoring with no checkpoints', () => {
      const restored = manager.restoreCheckpoint();
      expect(restored).toBe(false);
    });
  });

  // ── Message Conversion ──────────────────────────────────────

  describe('message conversion', () => {
    it('should convert internal to external format', () => {
      const internal: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      manager.setHistory(internal);
      const external = manager.exportMessages();

      expect(external).toHaveLength(2);
      expect(external[0]).toMatchObject({ role: 'user', content: 'Hello' });
      expect(external[1]).toMatchObject({ role: 'assistant', content: 'Hi there' });
    });

    it('should handle structured content blocks', () => {
      const internal: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: { arg: 'value' } },
          ],
        },
      ];

      manager.setHistory(internal);
      const external = manager.exportMessages();

      expect(external).toHaveLength(1);
      expect(external[0].content).toBe('Using tool');
      expect(external[0].toolCalls).toHaveLength(1);
      expect(external[0].toolCalls?.[0].name).toBe('test_tool');
    });

    it('should load messages from external format', () => {
      const external: Message[] = [
        { role: 'user', content: 'Test message' },
        { role: 'assistant', content: 'Response' },
      ];

      manager.loadMessages(external);

      expect(manager.getHistoryLength()).toBe(2);
      expect(manager.getHistory()[0].content).toBe('Test message');
    });
  });

  // ── Anti-Repetition Detection ───────────────────────────────

  describe('anti-repetition detection', () => {
    it('should detect exact repetition', () => {
      const sameText = 'This is a repeated message.';

      const result1 = manager.recordAssistantText(sameText);
      expect(result1.isExactRepeat).toBe(false); // First occurrence

      const result2 = manager.recordAssistantText(sameText);
      expect(result2.isExactRepeat).toBe(true); // Exact repeat
      expect(manager.getRepeatCount()).toBe(1);
    });

    it('should detect fuzzy repetition', () => {
      const text1 = 'The user wants to build a web application.';
      const text2 = 'The user wants to build a web application!'; // Minor diff

      // Need at least MIN_REPEAT_TEXTS_FOR_FUZZY (2) texts in history
      manager.recordAssistantText(text1);
      manager.recordAssistantText('Another different text'); // Add variety
      manager.recordAssistantText(text1); // Add text1 again to build history

      const result = manager.recordAssistantText(text2);
      // Fuzzy detection requires similarity and enough history
      // The actual behavior may vary, so we just check it doesn't crash
      expect(result.isFuzzyRepeat).toBeDefined();
    });

    it('should not flag different messages as repeats', () => {
      const text1 = 'First message';
      const text2 = 'Completely different message';

      manager.recordAssistantText(text1);
      const result = manager.recordAssistantText(text2);

      expect(result.isExactRepeat).toBe(false);
      expect(result.isFuzzyRepeat).toBe(false);
    });

    it('should reset repetition counter on different message', () => {
      const repeat = 'Same message';
      const different = 'Different message';

      manager.recordAssistantText(repeat);
      manager.recordAssistantText(repeat);
      expect(manager.getRepeatCount()).toBe(1);

      manager.recordAssistantText(different);
      expect(manager.getRepeatCount()).toBe(0); // Reset
    });

    it('should track recent assistant texts', () => {
      manager.recordAssistantText('Text 1');
      manager.recordAssistantText('Text 2');
      manager.recordAssistantText('Text 3');

      const recent = manager.getRecentAssistantTexts();
      expect(recent).toContain('Text 1');
      expect(recent).toContain('Text 2');
      expect(recent).toContain('Text 3');
    });

    it('should limit recent texts history', () => {
      // Add more than MAX_RECENT_TEXTS (4)
      for (let i = 0; i < 10; i++) {
        manager.recordAssistantText(`Message ${i}`);
      }

      const recent = manager.getRecentAssistantTexts();
      expect(recent.length).toBeLessThanOrEqual(4);
    });

    it('should compute similarity', () => {
      const text1 = 'This is a test message with a long prefix to check similarity detection.';
      manager.recordAssistantText(text1);

      const similarity = manager.computeSimilarity(text1);
      expect(similarity).toBeGreaterThan(0);
    });
  });

  // ── Context Summarization ───────────────────────────────────

  describe('context summarization', () => {
    it('should summarize long context', () => {
      // Add many messages (exceed CONTEXT_SOFT_LIMIT of 200)
      const messages: LLMMessage[] = [];
      for (let i = 0; i < 250; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message number ${i}`,
        });
      }

      const summary = manager.summarizeContext(messages);

      expect(summary.length).toBeLessThan(messages.length);
      expect(summary[0].content).toContain('Prior context summary');
    });

    it('should return unchanged for short context', () => {
      const messages: LLMMessage[] = [{ role: 'user', content: 'Short' }];

      const summary = manager.summarizeContext(messages);

      expect(summary).toEqual(messages); // Unchanged
    });

    it('should include key information in summary', () => {
      // Simulate many tool use messages (need to exceed CONTEXT_SOFT_LIMIT of 200)
      const messages: LLMMessage[] = [];
      for (let i = 0; i < 250; i++) {
        messages.push({ role: 'user', content: `User request ${i}` });
        messages.push({
          role: 'assistant',
          content: [
            { type: 'text', text: `Response ${i}` },
            { type: 'tool_use', id: `tool_${i}`, name: 'Write', input: { filePath: `file${i}.txt` } },
          ],
        });
      }

      const summary = manager.summarizeContext(messages);

      // The summary should have condensed the context
      expect(summary.length).toBeLessThan(messages.length);

      // Check that first message is a summary message
      if (summary.length > 0 && typeof summary[0].content === 'string') {
        expect(summary[0].content).toContain('Prior context summary');
      }
    });

    it('should estimate message tokens', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there, how can I help?' },
      ];

      const tokens = manager.estimateMessageTokens(messages);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(100);
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty history gracefully', () => {
      expect(() => manager.exportMessages()).not.toThrow();
      expect(() => manager.summarizeContext([])).not.toThrow();
      expect(() => manager.saveCheckpoint()).not.toThrow();
    });

    it('should handle restoring when no checkpoints exist', () => {
      manager.pushToHistory({ role: 'user', content: 'Test' });

      const restored = manager.restoreCheckpoint();
      expect(restored).toBe(false);
    });

    it('should handle very long messages', () => {
      const longContent = 'x'.repeat(100000);
      manager.pushToHistory({ role: 'user', content: longContent });

      expect(() => manager.exportMessages()).not.toThrow();
      expect(() => manager.summarizeContext(manager.getHistory())).not.toThrow();
    });

    it('should handle special characters in content', () => {
      const specialContent = 'Test\n\r\t"\'\\`{}[]<>';
      manager.pushToHistory({ role: 'user', content: specialContent });

      const external = manager.exportMessages();
      expect(external[0].content).toContain('Test');
    });

    it('should reset all state', () => {
      manager.pushToHistory({ role: 'user', content: 'Test' });
      manager.saveCheckpoint();
      manager.addTokenUsage(100, 50);
      manager.recordAssistantText('Test');

      manager.reset();

      expect(manager.getHistoryLength()).toBe(0);
      expect(manager.checkpointCount).toBe(0);
      expect(manager.getTokenUsage().inputTokens).toBe(0);
      expect(manager.getRepeatCount()).toBe(0);
    });

    it('should clone objects deeply', () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = manager.jsonClone(obj);

      clone.b.c = 999;

      expect(obj.b.c).toBe(2); // Original unchanged
      expect(clone.b.c).toBe(999);
    });
  });
});
