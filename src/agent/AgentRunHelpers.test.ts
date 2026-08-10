import { describe, it, expect } from 'vitest';
import {
  isComplexPrompt,
  formatComplexPrompt,
  validateMessages,
  checkExactRepeat,
  STREAM_TIMEOUT_MS,
  SIMILARITY_PREFIX_LEN,
} from './AgentRunHelpers.js';
import type { LLMMessage } from './LLMClient.js';

describe('AgentRunHelpers', () => {
  describe('isComplexPrompt', () => {
    it('should return false for simple short prompts', () => {
      expect(isComplexPrompt('hello')).toBe(false);
      expect(isComplexPrompt('fix the bug')).toBe(false);
    });

    it('should return true for long prompts', () => {
      const longPrompt = 'a'.repeat(201);
      expect(isComplexPrompt(longPrompt)).toBe(true);
    });

    it('should return true for prompts with multiple sentences', () => {
      expect(isComplexPrompt('Do this. Then do that.')).toBe(true);
      expect(isComplexPrompt('First, do A; Second, do B.')).toBe(true);
    });

    it('should return true for prompts with newlines', () => {
      expect(isComplexPrompt('Step 1\nStep 2')).toBe(true);
    });

    it('should handle Chinese punctuation', () => {
      expect(isComplexPrompt('做这个。然后做那个。')).toBe(true);
    });
  });

  describe('formatComplexPrompt', () => {
    it('should add planning guidance', () => {
      const result = formatComplexPrompt('Build a web app');
      expect(result).toContain('Task: Build a web app');
      expect(result).toContain('outline your approach');
      expect(result).toContain('step by step');
    });

    it('should preserve original prompt', () => {
      const prompt = 'Create a complex system';
      const result = formatComplexPrompt(prompt);
      expect(result).toContain(prompt);
    });
  });

  describe('validateMessages', () => {
    it('should not throw for non-empty messages', () => {
      const messages: LLMMessage[] = [{ role: 'user', content: 'hello' }];
      expect(() => validateMessages(messages, 'test')).not.toThrow();
    });

    it('should throw for empty messages', () => {
      const messages: LLMMessage[] = [];
      expect(() => validateMessages(messages, 'test')).toThrow(/empty/i);
    });

    it('should include context in error message', () => {
      const messages: LLMMessage[] = [];
      expect(() => validateMessages(messages, 'after-summarization')).toThrow(/after-summarization/i);
    });
  });

  describe('checkExactRepeat', () => {
    it('should detect exact repeat above threshold', () => {
      const text = 'same response';
      const result = checkExactRepeat(text, text, 2, 2);
      expect(result.isRepeat).toBe(true);
    });

    it('should not detect repeat below threshold', () => {
      const text = 'same response';
      const result = checkExactRepeat(text, text, 1, 2);
      expect(result.isRepeat).toBe(false);
    });

    it('should not detect repeat for different text', () => {
      const result = checkExactRepeat('response A', 'response B', 5, 2);
      expect(result.isRepeat).toBe(false);
    });

    it('should handle empty strings', () => {
      const result = checkExactRepeat('', '', 3, 2);
      expect(result.isRepeat).toBe(true);
    });
  });

  describe('constants', () => {
    it('should export STREAM_TIMEOUT_MS', () => {
      expect(STREAM_TIMEOUT_MS).toBe(300000);
    });

    it('should export SIMILARITY_PREFIX_LEN', () => {
      expect(SIMILARITY_PREFIX_LEN).toBe(100);
    });
  });
});
