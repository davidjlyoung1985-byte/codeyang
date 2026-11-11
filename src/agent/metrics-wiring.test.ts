/**
 * Wiring tests: prove the metrics/error infrastructure is actually reachable
 * from the agent loop.
 *
 * The gap these cover is specific: `ToolMetrics` and `CodeYangError` had unit
 * tests and 100% statement coverage, yet nothing in production code called
 * them, so `/metrics` always printed "Total Calls: 0". A unit test cannot catch
 * that class of bug — only a test that drives the real consumer can.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolMetrics, getToolMetrics, recordToolExecution, recordLLMCall } from '../metrics/index.js';
import { metrics as legacyMetrics } from '../utils/metrics.js';
import { ErrorCode, CodeYangError, wrapError, isRetryable, getRetryDelay } from '../errors/index.js';

describe('ToolMetrics wiring', () => {
  beforeEach(() => {
    ToolMetrics.getInstance().reset();
    ToolMetrics.getInstance().setEnabled(true);
  });

  describe('the /metrics command reads the same store the agent writes to', () => {
    it('recordToolExecution is visible through getToolMetrics', () => {
      // This is exactly what AgentToolExecutor.recordToolCall does.
      recordToolExecution('Read', 42, true);

      const metric = getToolMetrics().getToolMetric('Read');
      expect(metric).not.toBeNull();
      expect(metric!.calls).toBe(1);
      expect(metric!.totalTime).toBe(42);
      expect(metric!.successRate).toBe(1);
    });

    it('a failed call shows up as an error in the report', () => {
      recordToolExecution('Bash', 10, true);
      recordToolExecution('Bash', 20, false);

      const report = getToolMetrics().getReport();
      expect(report.totalCalls).toBe(2);
      expect(report.tools[0].errorCount).toBe(1);
      expect(report.tools[0].errorRate).toBe(0.5);
    });

    it('survives reset() so a fresh session starts at zero', () => {
      recordToolExecution('Read', 42, true);
      ToolMetrics.getInstance().reset();

      expect(getToolMetrics().getReport().totalCalls).toBe(0);
      expect(getToolMetrics().getToolMetric('Read')).toBeNull();
    });

    it('honours setEnabled(false) so metrics can be switched off', () => {
      ToolMetrics.getInstance().setEnabled(false);
      recordToolExecution('Read', 42, true);
      expect(getToolMetrics().getToolMetric('Read')).toBeNull();
    });
  });

  describe('LLM call tracking', () => {
    it('records LLM latency separately from tools', () => {
      recordLLMCall(500, true);
      recordLLMCall(1500, false);

      const llm = getToolMetrics().getLLMCallMetric();
      expect(llm.calls).toBe(2);
      expect(llm.totalTime).toBe(2000);
      expect(llm.errorCount).toBe(1);

      // Must not leak into the per-tool report.
      expect(getToolMetrics().getReport().totalCalls).toBe(0);
    });

    it('reports zeroed LLM metrics when nothing was recorded', () => {
      const llm = getToolMetrics().getLLMCallMetric();
      expect(llm.calls).toBe(0);
      expect(llm.avgTime).toBe(0);
      expect(llm.errorRate).toBe(0);
    });
  });

  describe('percentiles', () => {
    it('computes p50/p95/p99 from the retained sample window', () => {
      for (let i = 1; i <= 100; i++) {
        recordToolExecution('SlowTool', i, true);
      }

      const metric = getToolMetrics().getToolMetric('SlowTool')!;
      expect(metric.p50Time).toBeCloseTo(50.5, 1);
      expect(metric.p95Time).toBeCloseTo(95.05, 1);
      expect(metric.p99Time).toBeCloseTo(99.01, 1);
      expect(metric.avgTime).toBe(50.5);
    });

    it('returns the single sample for all percentiles', () => {
      recordToolExecution('Solo', 7, true);
      const metric = getToolMetrics().getToolMetric('Solo')!;
      expect(metric.p50Time).toBe(7);
      expect(metric.p95Time).toBe(7);
      expect(metric.p99Time).toBe(7);
    });

    it('caps the sample window instead of growing without bound', () => {
      for (let i = 0; i < 1200; i++) {
        recordToolExecution('Chatty', i, true);
      }

      const exported = getToolMetrics().exportData();
      expect(exported['Chatty'].samples.length).toBeLessThanOrEqual(1000);
      // Aggregate counts are unaffected by the window cap.
      expect(getToolMetrics().getToolMetric('Chatty')!.calls).toBe(1200);
    });
  });

  describe('legacy utils/metrics facade', () => {
    it('delegates writes to the canonical store', () => {
      legacyMetrics.recordToolExecution('Write', 99, true);

      // Same data, seen through the new API.
      expect(getToolMetrics().getToolMetric('Write')!.calls).toBe(1);
    });

    it('delegates reads from the canonical store', () => {
      recordToolExecution('Glob', 12, true);

      const legacy = legacyMetrics.getToolMetrics('Glob');
      expect(legacy).not.toBeNull();
      expect(legacy!.name).toBe('Glob');
      expect(legacy!.totalCalls).toBe(1);
      expect(legacy!.avgDurationMs).toBe(12);
    });

    it('does not keep a second independent copy of the data', () => {
      recordToolExecution('Edit', 5, true);
      legacyMetrics.clear();

      // Clearing through the old API must clear the one real store.
      expect(getToolMetrics().getToolMetric('Edit')).toBeNull();
    });

    it('exposes LLM metrics through the legacy shape', () => {
      recordLLMCall(300, true);
      const llm = legacyMetrics.getLLMMetrics();
      expect(llm.name).toBe('LLM API');
      expect(llm.totalCalls).toBe(1);
      expect(llm.avgDurationMs).toBe(300);
    });
  });

  describe('import/export round-trip', () => {
    it('restores counters and recomputes percentiles', () => {
      recordToolExecution('Bash', 10, true);
      recordToolExecution('Bash', 30, false);

      const dump = getToolMetrics().exportData();
      ToolMetrics.getInstance().reset();
      getToolMetrics().importData(dump);

      const metric = getToolMetrics().getToolMetric('Bash')!;
      expect(metric.calls).toBe(2);
      expect(metric.errorCount).toBe(1);
      expect(metric.p50Time).toBe(20);
    });

    it('tolerates exports written before the samples window existed', () => {
      getToolMetrics().importData({
        Old: {
          calls: 3,
          totalTime: 60,
          minTime: 10,
          maxTime: 30,
          successCount: 3,
          errorCount: 0,
          lastUsed: Date.now(),
        } as never,
      });

      const metric = getToolMetrics().getToolMetric('Old')!;
      expect(metric.calls).toBe(3);
      expect(metric.avgTime).toBe(20);
      // No samples to percentile over — must not throw or return NaN.
      expect(metric.p50Time).toBe(0);
    });
  });
});

describe('CodeYangError wiring in the tool execution path', () => {
  it('wrapError preserves an already-wrapped error', () => {
    const original = new CodeYangError('boom', ErrorCode.TOOL_TIMEOUT);
    expect(wrapError(original)).toBe(original);
  });

  it('classifies ENOENT as a file-not-found error', () => {
    const wrapped = wrapError(new Error('ENOENT: no such file or directory'));
    expect(wrapped.code).toBe(ErrorCode.FILE_NOT_FOUND);
    expect(wrapped.recovery.canRetry).toBe(false);
  });

  it('classifies timeout and 429 failures as retryable', () => {
    const timeout = wrapError(new Error('Request timeout after 30s'));
    expect(timeout.recovery.canRetry).toBe(true);
    expect(timeout.recovery.maxRetries).toBeGreaterThanOrEqual(1);

    const rateLimit = wrapError(new Error('429 rate limit exceeded'));
    expect(rateLimit.code).toBe(ErrorCode.LLM_RATE_LIMIT);
    expect(isRetryable(rateLimit)).toBe(true);
  });

  it('attributes the failure to the tool that produced it', () => {
    const wrapped = wrapError(new Error('boom'), { operation: 'tool.execute', tool: 'Bash' });
    expect(wrapped.context.tool).toBe('Bash');
    expect(wrapped.context.operation).toBe('tool.execute');
  });

  it('keeps the original error reachable for debugging', () => {
    const original = new Error('root cause');
    const wrapped = wrapError(original);
    expect(wrapped.originalError).toBe(original);
    expect(wrapped.toJSON()).toMatchObject({ message: 'root cause' });
  });

  it('exposes a user-facing message per error code', () => {
    const err = new CodeYangError('raw', ErrorCode.LLM_AUTH_FAILED);
    expect(err.getUserMessage()).not.toBe('raw');
    expect(err.getUserMessage().length).toBeGreaterThan(0);
  });

  it('backs off exponentially, honouring the code-specific base delay', () => {
    const err = wrapError(new Error('429 rate limit'));
    const first = getRetryDelay(err, 1);
    const third = getRetryDelay(err, 3);
    expect(third).toBe(first * 4);
    expect(first).toBeGreaterThan(0);
  });

  it('falls back to a 1s base delay for unwrapped errors', () => {
    expect(getRetryDelay(new Error('plain'), 1)).toBe(1000);
    expect(getRetryDelay(new Error('plain'), 3)).toBe(4000);
  });
});

describe('AgentToolExecutor -> metrics integration', () => {
  it('records a call through recordToolCall into the /metrics store', async () => {
    ToolMetrics.getInstance().reset();

    // Import lazily so the module graph matches what the agent loads.
    const { AgentToolExecutor } = await import('./AgentToolExecutor.js');
    const { ReflexionEngine } = await import('../experimental/reflexion/ReflexionEngine.js');

    const executor = new AgentToolExecutor(new ReflexionEngine({ enabled: false } as never));

    // Third argument is `isError`, so this is a successful call.
    executor.recordToolCall('Read', 25, false);

    const metric = getToolMetrics().getToolMetric('Read');
    expect(metric).not.toBeNull();
    expect(metric!.calls).toBe(1);
    expect(metric!.errorCount).toBe(0);
    expect(metric!.totalTime).toBe(25);
  });

  it('keeps the in-process toolStats in sync with the metrics store', async () => {
    ToolMetrics.getInstance().reset();

    const { AgentToolExecutor } = await import('./AgentToolExecutor.js');
    const { ReflexionEngine } = await import('../experimental/reflexion/ReflexionEngine.js');

    const executor = new AgentToolExecutor(new ReflexionEngine({ enabled: false } as never));

    executor.recordToolCall('Bash', 10, false);
    executor.recordToolCall('Bash', 20, true);

    const stats = executor.getToolStats().get('Bash')!;
    expect(stats.calls).toBe(2);
    expect(stats.errors).toBe(1);
    expect(stats.totalMs).toBe(30);

    // And the same numbers are visible to /metrics.
    const metric = getToolMetrics().getToolMetric('Bash')!;
    expect(metric.calls).toBe(2);
    expect(metric.errorCount).toBe(1);
  });
});
