import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { metrics, createTimer } from './metrics.js';

describe('MetricsCollector', () => {
  beforeEach(() => {
    metrics.clear();
  });

  describe('recordToolExecution / getToolMetrics', () => {
    it('returns null for unknown tool', () => {
      expect(metrics.getToolMetrics('NonExistent')).toBeNull();
    });

    it('records a single execution and returns correct metrics', () => {
      metrics.recordToolExecution('Bash', 100, true);
      const m = metrics.getToolMetrics('Bash');
      expect(m).not.toBeNull();
      expect(m!.name).toBe('Bash');
      expect(m!.totalCalls).toBe(1);
      expect(m!.successCount).toBe(1);
      expect(m!.failureCount).toBe(0);
      expect(m!.totalDurationMs).toBe(100);
      expect(m!.avgDurationMs).toBe(100);
      expect(m!.minDurationMs).toBe(100);
      expect(m!.maxDurationMs).toBe(100);
      expect(m!.errorRate).toBe(0);
    });

    it('records multiple executions and calculates percentiles', () => {
      metrics.recordToolExecution('Read', 10, true);
      metrics.recordToolExecution('Read', 20, true);
      metrics.recordToolExecution('Read', 30, true);
      metrics.recordToolExecution('Read', 40, true);
      metrics.recordToolExecution('Read', 50, false);

      const m = metrics.getToolMetrics('Read');
      expect(m!.totalCalls).toBe(5);
      expect(m!.successCount).toBe(4);
      expect(m!.failureCount).toBe(1);
      expect(m!.avgDurationMs).toBe(30);
      expect(m!.minDurationMs).toBe(10);
      expect(m!.maxDurationMs).toBe(50);
      expect(m!.p50Ms).toBe(30);
      expect(m!.errorRate).toBe(0.2);
    });

    it('handles executions with metadata', () => {
      metrics.recordToolExecution('Git', 200, true, { branch: 'main' });
      const m = metrics.getToolMetrics('Git');
      expect(m!.totalCalls).toBe(1);
    });
  });

  describe('recordLLMCall / getLLMMetrics', () => {
    it('returns zeroed metrics when no LLM calls recorded', () => {
      const m = metrics.getLLMMetrics();
      expect(m.totalCalls).toBe(0);
      expect(m.avgDurationMs).toBe(0);
      expect(m.errorRate).toBe(0);
    });

    it('records LLM calls and returns aggregated metrics', () => {
      metrics.recordLLMCall(500, true);
      metrics.recordLLMCall(1500, true);
      metrics.recordLLMCall(3000, false);

      const m = metrics.getLLMMetrics();
      expect(m.totalCalls).toBe(3);
      expect(m.successCount).toBe(2);
      expect(m.failureCount).toBe(1);
      expect(m.totalDurationMs).toBe(5000);
      expect(m.avgDurationMs).toBeCloseTo(1666.67, 0);
      expect(m.errorRate).toBeCloseTo(0.333, 1);
    });
  });

  describe('getAllToolMetrics', () => {
    it('returns empty array when no tools recorded', () => {
      expect(metrics.getAllToolMetrics()).toEqual([]);
    });

    it('returns all tools sorted by call count descending', () => {
      metrics.recordToolExecution('A', 10, true);
      metrics.recordToolExecution('B', 20, true);
      metrics.recordToolExecution('B', 20, true);
      metrics.recordToolExecution('C', 30, true);
      metrics.recordToolExecution('C', 30, true);
      metrics.recordToolExecution('C', 30, true);

      const all = metrics.getAllToolMetrics();
      expect(all).toHaveLength(3);
      expect(all[0].name).toBe('C');
      expect(all[1].name).toBe('B');
      expect(all[2].name).toBe('A');
    });
  });

  describe('getSystemMetrics', () => {
    it('returns system metrics with expected structure', () => {
      const sys = metrics.getSystemMetrics();
      expect(sys).toHaveProperty('uptime');
      expect(sys).toHaveProperty('memoryUsageMB');
      expect(sys).toHaveProperty('heapUsedMB');
      expect(sys).toHaveProperty('heapTotalMB');
      expect(sys.uptime).toBeGreaterThanOrEqual(0);
      expect(sys.memoryUsageMB).toBeGreaterThan(0);
    });
  });

  describe('getReport', () => {
    it('returns a string report when no data', () => {
      const report = metrics.getReport();
      expect(typeof report).toBe('string');
      expect(report).toContain('Performance Report');
    });

    it('includes tool data in report', () => {
      metrics.recordToolExecution('Bash', 100, true);
      metrics.recordToolExecution('Read', 50, true);
      const report = metrics.getReport();
      expect(report).toContain('Bash');
      expect(report).toContain('Read');
    });

    it('includes LLM data when calls recorded', () => {
      metrics.recordLLMCall(500, true);
      const report = metrics.getReport();
      expect(report).toContain('LLM API');
      expect(report).toContain('Avg Latency');
    });

    it('identifies slow tools (>100ms avg)', () => {
      metrics.recordToolExecution('SlowTool', 500, true);
      metrics.recordToolExecution('FastTool', 10, true);
      const report = metrics.getReport();
      expect(report).toContain('Slowest Tools');
      expect(report).toContain('SlowTool');
    });

    it('identifies error-prone tools (>10% failure)', () => {
      for (let i = 0; i < 10; i++) {
        metrics.recordToolExecution('BuggyTool', 100, i >= 8);
      }
      const report = metrics.getReport();
      expect(report).toContain('Error-Prone');
      expect(report).toContain('BuggyTool');
    });
  });

  describe('exportJSON', () => {
    it('returns valid JSON string', () => {
      metrics.recordToolExecution('Test', 10, true);
      const json = metrics.exportJSON();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('system');
      expect(parsed).toHaveProperty('llm');
      expect(parsed).toHaveProperty('tools');
      expect(parsed.tools).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('resets all metrics', () => {
      metrics.recordToolExecution('X', 10, true);
      metrics.recordLLMCall(100, true);
      metrics.clear();

      expect(metrics.getToolMetrics('X')).toBeNull();
      expect(metrics.getLLMMetrics().totalCalls).toBe(0);
      expect(metrics.getAllToolMetrics()).toHaveLength(0);
    });
  });
});

describe('createTimer', () => {
  it('returns elapsed time in milliseconds', async () => {
    const timer = createTimer();
    await new Promise((r) => setTimeout(r, 10));
    const elapsed = timer.end();
    expect(elapsed).toBeGreaterThanOrEqual(8);
  });
});
