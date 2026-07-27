/**
 * Tests for Tree-of-Thoughts module — complexity estimation, path parsing.
 */
import { describe, it, expect } from 'vitest';
import { TreeOfThoughts } from './TreeOfThoughts.js';

describe('TreeOfThoughts', () => {
  describe('shouldUseToT', () => {
    it('should return false when disabled', () => {
      const tot = new TreeOfThoughts({ enabled: false });
      expect(tot.shouldUseToT('simple task')).toBe(false);
    });

    it('should return false for simple tasks', () => {
      const tot = new TreeOfThoughts({ complexityThreshold: 8 });
      expect(tot.shouldUseToT('hello world')).toBe(false);
    });

    it('should return true for complex tasks', () => {
      const tot = new TreeOfThoughts({ complexityThreshold: 1 });
      expect(tot.shouldUseToT('complex task')).toBe(true);
    });

    it('should detect complexity from task length', () => {
      const tot = new TreeOfThoughts({ complexityThreshold: 2 });
      const longTask = 'x'.repeat(250); // Gets 2 points for length > 200
      expect(tot.shouldUseToT(longTask)).toBe(true);
    });

    it('should detect complexity from keywords', () => {
      const tot = new TreeOfThoughts({ complexityThreshold: 3 });
      expect(tot.shouldUseToT('refactor the database architecture')).toBe(true);
    });

    it('should detect complexity from bullet points', () => {
      const tot = new TreeOfThoughts({ complexityThreshold: 3 });
      const taskWithBullets = ['Requirements:', '- A', '- B', '- C'].join('\n');
      expect(tot.shouldUseToT(taskWithBullets)).toBe(true);
    });
  });

  describe('formatResult', () => {
    it('should format a basic result', () => {
      const tot = new TreeOfThoughts();
      const result = {
        task: 'test task',
        explored: [
          {
            id: 'path-1',
            approach: 'Simple approach',
            steps: ['Step 1', 'Step 2'],
            evaluation: {
              score: 85,
              strengths: ['Fast'],
              weaknesses: ['Not scalable'],
              risks: [],
              recommendation: 'select' as const,
            },
            result: 'ok',
            status: 'selected' as const,
          },
          {
            id: 'path-2',
            approach: 'Alternative approach',
            steps: ['Step A'],
            evaluation: {
              score: 60,
              strengths: ['Robust'],
              weaknesses: ['Slow'],
              risks: [],
              recommendation: 'reject' as const,
            },
            result: 'ok',
            status: 'evaluated' as const,
          },
        ],
        selected: {
          id: 'path-1',
          approach: 'Simple approach',
          steps: ['Step 1', 'Step 2'],
          evaluation: {
            score: 85,
            strengths: ['Fast'],
            weaknesses: ['Not scalable'],
            risks: [],
            recommendation: 'select' as const,
          },
          result: 'ok',
          status: 'selected' as const,
        },
        mergedInsights: [],
        summary: 'Simple approach recommended',
      };

      const formatted = tot.formatResult(result);
      expect(formatted).toContain('Simple approach');
      expect(formatted).toContain('85/100');
      expect(formatted).toContain('Step 1');
      expect(formatted).toContain('Simple approach recommended');
    });

    it('should include merged insights', () => {
      const tot = new TreeOfThoughts();
      const result = {
        task: 'test',
        explored: [
          {
            id: 'p1',
            approach: 'Main',
            steps: ['S1'],
            evaluation: { score: 80, strengths: [], weaknesses: [], risks: [], recommendation: 'select' as const },
            result: '',
            status: 'selected' as const,
          },
        ],
        selected: {
          id: 'p1',
          approach: 'Main',
          steps: ['S1'],
          evaluation: { score: 80, strengths: [], weaknesses: [], risks: [], recommendation: 'select' as const },
          result: '',
          status: 'selected' as const,
        },
        mergedInsights: ['From path 2: use caching', 'From path 3: add validation'],
        summary: 'Plan with improvements',
      };

      const formatted = tot.formatResult(result);
      expect(formatted).toContain('Merged Insights');
      expect(formatted).toContain('use caching');
      expect(formatted).toContain('add validation');
    });
  });
});
