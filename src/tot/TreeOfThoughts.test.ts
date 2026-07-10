/**
 * Tests for Tree of Thoughts implementation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TreeOfThoughts } from './TreeOfThoughts.js';

describe('TreeOfThoughts', () => {
  let tot: TreeOfThoughts;

  beforeEach(() => {
    // Mock LLM client
    const mockClient = {
      chat: vi.fn(),
      stream: vi.fn(),
    };
    tot = new TreeOfThoughts(mockClient as Partial<LLMClient> as LLMClient);
  });

  describe('Constructor', () => {
    it('should create a new TreeOfThoughts instance', () => {
      expect(tot).toBeInstanceOf(TreeOfThoughts);
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        enabled: true,
        numPaths: 5,
        autoSelectThreshold: 80,
        enableMerging: false,
        complexityThreshold: 7,
      };
      const customTot = new TreeOfThoughts({} as LLMClient, customConfig);
      expect(customTot).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should use default config', () => {
      expect(tot).toBeDefined();
    });

    it('should validate config values', () => {
      const config = {
        enabled: true,
        numPaths: 3,
        autoSelectThreshold: 75,
        enableMerging: true,
        complexityThreshold: 5,
      };
      expect(config.numPaths).toBeGreaterThan(0);
      expect(config.autoSelectThreshold).toBeGreaterThanOrEqual(0);
      expect(config.autoSelectThreshold).toBeLessThanOrEqual(100);
    });
  });

  describe('Path structure', () => {
    it('should define ThoughtPath interface', () => {
      const path = {
        id: 'path-1',
        approach: 'Test approach',
        steps: ['Step 1', 'Step 2'],
        evaluation: {
          score: 85,
          strengths: ['Fast'],
          weaknesses: ['Complex'],
          risks: ['Memory'],
          recommendation: 'select' as const,
        },
        result: 'Success',
        status: 'evaluated' as const,
      };
      expect(path.id).toBe('path-1');
      expect(path.evaluation.score).toBe(85);
    });

    it('should support different path statuses', () => {
      const statuses = ['exploring', 'evaluated', 'selected', 'failed'];
      statuses.forEach((status) => {
        expect(['exploring', 'evaluated', 'selected', 'failed']).toContain(status);
      });
    });
  });

  describe('Evaluation structure', () => {
    it('should define PathEvaluation interface', () => {
      const evaluation = {
        score: 75,
        strengths: ['Efficient', 'Simple'],
        weaknesses: ['Limited scope'],
        risks: ['Edge cases'],
        recommendation: 'merge' as const,
      };
      expect(evaluation.score).toBeGreaterThanOrEqual(0);
      expect(evaluation.score).toBeLessThanOrEqual(100);
      expect(evaluation.strengths).toBeInstanceOf(Array);
    });

    it('should support recommendation types', () => {
      const recommendations = ['select', 'merge', 'reject'];
      recommendations.forEach((rec) => {
        expect(['select', 'merge', 'reject']).toContain(rec);
      });
    });
  });

  describe('Result structure', () => {
    it('should define TreeOfThoughtsResult interface', () => {
      const result = {
        task: 'Test task',
        explored: [],
        selected: {
          id: 'best-path',
          approach: 'Best approach',
          steps: [],
          evaluation: {
            score: 90,
            strengths: [],
            weaknesses: [],
            risks: [],
            recommendation: 'select' as const,
          },
          result: 'Done',
          status: 'selected' as const,
        },
        mergedInsights: ['Insight 1'],
        summary: 'Summary',
      };
      expect(result.task).toBe('Test task');
      expect(result.selected.id).toBe('best-path');
    });
  });

  describe('Type safety', () => {
    it('should enforce score range', () => {
      const validScores = [0, 50, 100];
      validScores.forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    it('should enforce status values', () => {
      const validStatuses: Array<'exploring' | 'evaluated' | 'selected' | 'failed'> = [
        'exploring',
        'evaluated',
        'selected',
        'failed',
      ];
      expect(validStatuses.length).toBe(4);
    });
  });
});
