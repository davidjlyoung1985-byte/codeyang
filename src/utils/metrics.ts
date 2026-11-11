/**
 * Legacy metrics facade - DEPRECATED.
 *
 * The real implementation lives in `src/metrics/ToolMetrics.ts`. This module
 * used to carry a second, independent collector; keeping two stores meant
 * `/metrics` could show empty data while `utils/metrics` had numbers. It now
 * delegates everything to the single canonical store and only adapts field
 * names for older call sites.
 *
 * Prefer importing from `../metrics/index.js` in new code:
 *
 *   import { recordToolExecution, getToolMetrics } from '../metrics/index.js';
 *
 * Kept for backward compatibility with `utils/metrics.test.ts` and any external
 * consumer that used the `metrics` singleton.
 */

import { ToolMetrics, type ToolMetric } from '../metrics/ToolMetrics.js';

/** Legacy per-tool metric shape (different field names, percentile ms suffix). */
export interface LegacyToolMetrics {
  name: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
}

function toLegacy(m: ToolMetric): LegacyToolMetrics {
  return {
    name: m.tool,
    totalCalls: m.calls,
    successCount: m.successCount,
    failureCount: m.errorCount,
    totalDurationMs: m.totalTime,
    avgDurationMs: m.avgTime,
    minDurationMs: m.minTime,
    maxDurationMs: m.maxTime,
    p50Ms: m.p50Time,
    p95Ms: m.p95Time,
    p99Ms: m.p99Time,
    errorRate: m.errorRate,
  };
}

/**
 * Backward-compatible view over {@link ToolMetrics}. Holds no state of its own.
 */
class MetricsCollector {
  private get store(): ToolMetrics {
    return ToolMetrics.getInstance();
  }

  /**
   * Record a tool execution.
   * @deprecated use `recordToolExecution` from `../metrics/index.js`.
   * The `metadata` argument is accepted for compatibility but not stored.
   */
  recordToolExecution(
    toolName: string,
    durationMs: number,
    success: boolean,
    _metadata?: Record<string, unknown>,
  ): void {
    this.store.record(toolName, durationMs, success);
  }

  /**
   * Record an LLM API call.
   * @deprecated use `recordLLMCall` from `../metrics/index.js`.
   */
  recordLLMCall(durationMs: number, success: boolean, _metadata?: Record<string, unknown>): void {
    this.store.recordLLMCall(durationMs, success);
  }

  /** Metrics for one tool, or null when it was never called. */
  getToolMetrics(toolName: string): LegacyToolMetrics | null {
    const metric = this.store.getToolMetric(toolName);
    return metric ? toLegacy(metric) : null;
  }

  /** All tool metrics, sorted by call count descending. */
  getAllToolMetrics(): LegacyToolMetrics[] {
    return this.store.getAllMetrics().map(toLegacy);
  }

  /** Aggregated LLM API metrics. Zeroed when nothing was recorded. */
  getLLMMetrics(): LegacyToolMetrics {
    return toLegacy(this.store.getLLMCallMetric());
  }

  /** Process uptime and memory usage. */
  getSystemMetrics(): { uptime: number; memoryUsageMB: number; heapUsedMB: number; heapTotalMB: number } {
    return this.store.getSystemMetrics();
  }

  /**
   * Legacy report layout (system + LLM + tools, 100ms slow-tool threshold).
   * `/metrics` renders its own report from the canonical data instead.
   */
  getReport(): string {
    const tools = this.getAllToolMetrics();
    const llm = this.getLLMMetrics();
    const system = this.getSystemMetrics();

    let report = '=== Performance Report ===\n\n';

    report += '--- System Metrics ---\n';
    report += `Uptime:       ${(system.uptime / 1000).toFixed(0)}s\n`;
    report += `Memory:       ${system.memoryUsageMB.toFixed(1)} MB\n`;
    report += `Heap Used:    ${system.heapUsedMB.toFixed(1)} MB\n`;
    report += `Heap Total:   ${system.heapTotalMB.toFixed(1)} MB\n\n`;

    if (llm.totalCalls > 0) {
      report += '--- LLM API Metrics ---\n';
      report += `Total Calls:  ${llm.totalCalls}\n`;
      report += `Success:      ${llm.successCount} (${((llm.successCount / llm.totalCalls) * 100).toFixed(1)}%)\n`;
      report += `Failures:     ${llm.failureCount}\n`;
      report += `Avg Latency:  ${llm.avgDurationMs.toFixed(0)}ms\n`;
      report += `P50:          ${llm.p50Ms.toFixed(0)}ms\n`;
      report += `P95:          ${llm.p95Ms.toFixed(0)}ms\n`;
      report += `P99:          ${llm.p99Ms.toFixed(0)}ms\n\n`;
    }

    if (tools.length > 0) {
      report += '--- Top Tools (by call count) ---\n';
      for (const tool of tools.slice(0, 10)) {
        const successRate = ((tool.successCount / tool.totalCalls) * 100).toFixed(0);
        report +=
          `${tool.name.padEnd(20)} ${String(tool.totalCalls).padStart(5)} calls  ` +
          `${tool.avgDurationMs.toFixed(0).padStart(5)}ms avg  ${successRate}% ok\n`;
      }
      report += '\n';
    }

    const slowTools = tools.filter((t) => t.avgDurationMs > 100).slice(0, 5);
    if (slowTools.length > 0) {
      report += '--- Slowest Tools (>100ms avg) ---\n';
      for (const tool of slowTools) {
        report +=
          `${tool.name.padEnd(20)} ${tool.avgDurationMs.toFixed(0).padStart(6)}ms avg  ` +
          `(p95: ${tool.p95Ms.toFixed(0)}ms)\n`;
      }
      report += '\n';
    }

    const errorTools = tools.filter((t) => t.errorRate > 0.1).slice(0, 5);
    if (errorTools.length > 0) {
      report += '--- Error-Prone Tools (>10% failure) ---\n';
      for (const tool of errorTools) {
        report +=
          `${tool.name.padEnd(20)} ${(tool.errorRate * 100).toFixed(1)}% error rate  ` +
          `(${tool.failureCount}/${tool.totalCalls})\n`;
      }
      report += '\n';
    }

    return report;
  }

  /** Metrics as a JSON string. */
  exportJSON(): string {
    return JSON.stringify(
      {
        system: this.getSystemMetrics(),
        llm: this.getLLMMetrics(),
        tools: this.getAllToolMetrics(),
      },
      null,
      2,
    );
  }

  /** Clear every recorded metric. */
  clear(): void {
    this.store.reset();
  }
}

/** Backward-compatible singleton. Delegates to {@link ToolMetrics}. */
export const metrics = new MetricsCollector();

/** Timer utility for measuring operations. */
export function createTimer(): { end: () => number } {
  const start = performance.now();
  return {
    end: () => performance.now() - start,
  };
}
