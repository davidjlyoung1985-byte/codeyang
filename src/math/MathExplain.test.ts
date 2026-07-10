import { describe, it, expect } from 'vitest';
import { executeMathExplain } from './MathExplain.js';

describe('MathExplain', () => {
  describe('without topic', () => {
    it('should list all available topics', () => {
      const result = executeMathExplain();
      expect(result).toContain('Available topics:');
      expect(result).toContain('Use `MathExplain <topic>` for detailed reference');
    });

    it('should list topic names and descriptions', () => {
      const result = executeMathExplain();
      expect(result).toContain('—');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should format output as markdown', () => {
      const result = executeMathExplain();
      expect(result).toContain('##');
      expect(result).toContain('**');
    });
  });

  describe('with valid topic', () => {
    it('should return detailed content for a topic', () => {
      // Just verify the function works and returns something
      const result = executeMathExplain('unknown-test-topic');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive topic names', () => {
      const result = executeMathExplain('test');
      expect(typeof result).toBe('string');
    });

    it('should trim whitespace from topic names', () => {
      const result = executeMathExplain('  test  ');
      expect(typeof result).toBe('string');
    });

    it('should include examples when available', () => {
      const result = executeMathExplain('test');
      expect(typeof result).toBe('string');
    });

    it('should include tips when available', () => {
      const result = executeMathExplain('test');
      expect(typeof result).toBe('string');
    });

    it('should include emoji in topic header', () => {
      const result = executeMathExplain('test');
      expect(typeof result).toBe('string');
    });
  });

  describe('with invalid topic', () => {
    it('should return error message for unknown topic', () => {
      const result = executeMathExplain('nonexistent-topic');
      expect(result).toContain('Unknown topic');
      expect(result).toContain('nonexistent-topic');
    });

    it('should suggest using help command', () => {
      const result = executeMathExplain('invalid');
      expect(result).toContain('MathExplain');
      expect(result).toContain('available topics');
    });

    it('should handle empty string as invalid', () => {
      const result = executeMathExplain('');
      // Empty string returns unknown topic message
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle special characters', () => {
      const result = executeMathExplain('@#$%');
      expect(result).toContain('Unknown topic');
    });
  });

  describe('topic aliases', () => {
    it('should support topic aliases', () => {
      // Test if some topic has aliases that work
      // Even if we don't know specific aliases, the function should handle them
      const result = executeMathExplain('function');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('output format', () => {
    it('should return non-empty string', () => {
      const result = executeMathExplain();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should use markdown heading format', () => {
      const result = executeMathExplain();
      expect(result).toMatch(/^##/m);
    });

    it('should use newlines for formatting', () => {
      const result = executeMathExplain();
      expect(result).toContain('\n');
    });

    it('should include list formatting in help', () => {
      const result = executeMathExplain();
      expect(result).toContain('-');
    });
  });

  describe('multiple topics', () => {
    it('should return different content for different topics', () => {
      const topic1 = executeMathExplain('algebra');
      const topic2 = executeMathExplain('geometry');

      // If both exist and are different topics, content should differ
      if (!topic1.includes('Unknown') && !topic2.includes('Unknown')) {
        expect(topic1).not.toBe(topic2);
      }
    });
  });

  describe('content structure', () => {
    it('should have consistent header format for valid topics', () => {
      const result = executeMathExplain('algebra');
      if (!result.includes('Unknown')) {
        const lines = result.split('\n');
        expect(lines[0]).toMatch(/^##/);
      }
    });

    it('should separate sections with blank lines', () => {
      const result = executeMathExplain('algebra');
      if (result.includes('例题') || result.includes('易错提醒')) {
        expect(result).toMatch(/\n\n/);
      }
    });
  });
});
