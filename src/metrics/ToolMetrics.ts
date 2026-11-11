/**
 * ToolMetrics - the single source of truth for runtime performance metrics.
 *
 * Tracks, per tool:
 * - call count, total/avg/min/max duration
 * - p50/p95/p99 latency (from a bounded sample window)
 * - success/error counts and rates
 *
 * Also tracks LLM API calls and process-level system metrics. Every other
 * metrics API in the codebase (see `utils/metrics.ts`) delegates here so there
 * is exactly one implementation.
 */

/** How many latency samples we retain per tool for percentile math. */
const MAX_SAMPLES = 1000;

export interface ToolMetric {
  tool: string;
  calls: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  /** Median latency from the retained sample window. */
  p50Time: number;
  p95Time: number;
  p99Time: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  errorRate: number;
  lastUsed: number;
}

export interface PerformanceReport {
  totalCalls: number;
  totalTime: number;
  avgTime: number;
  tools: ToolMetric[];
  slowTools: ToolMetric[];
  errorProneTools: ToolMetric[];
  topTools: ToolMetric[];
}

export interface SystemMetrics {
  uptime: number;
  memoryUsageMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
}

export interface MetricData {
  calls: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  successCount: number;
  errorCount: number;
  lastUsed: number;
  /** Bounded ring of recent durations, used only for percentiles. */
  samples: number[];
}

function emptyData(): MetricData {
  return {
    calls: 0,
    totalTime: 0,
    minTime: Infinity,
    maxTime: 0,
    successCount: 0,
    errorCount: 0,
    lastUsed: Date.now(),
    samples: [],
  };
}

/** Linear-interpolated percentile over an ascending-sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export class ToolMetrics {
  private static instance: ToolMetrics | null = null;
  private metrics = new Map<string, MetricData>();
  private llmData = emptyData();
  private enabled = true;
  private startTime = Date.now();

  private constructor() {
    // Singleton pattern
  }

  static getInstance(): ToolMetrics {
    if (!ToolMetrics.instance) {
      ToolMetrics.instance = new ToolMetrics();
    }
    return ToolMetrics.instance;
  }

  /** Record one tool execution. */
  record(tool: string, duration: number, success: boolean): void {
    if (!this.enabled) return;

    const metric = this.metrics.get(tool) ?? emptyData();

    metric.calls++;
    metric.totalTime += duration;
    metric.minTime = Math.min(metric.minTime, duration);
    metric.maxTime = Math.max(metric.maxTime, duration);
    metric.lastUsed = Date.now();

    if (success) {
      metric.successCount++;
    } else {
      metric.errorCount++;
    }

    metric.samples.push(duration);
    if (metric.samples.length > MAX_SAMPLES) {
      metric.samples.shift();
    }

    this.metrics.set(tool, metric);
  }

  /** Record one LLM API call. */
  recordLLMCall(duration: number, success: boolean): void {
    if (!this.enabled) return;

    const data = this.llmData;
    data.calls++;
    data.totalTime += duration;
    data.minTime = Math.min(data.minTime, duration);
    data.maxTime = Math.max(data.maxTime, duration);
    data.lastUsed = Date.now();

    if (success) {
      data.successCount++;
    } else {
      data.errorCount++;
    }

    data.samples.push(duration);
    if (data.samples.length > MAX_SAMPLES) {
      data.samples.shift();
    }
  }

  /** Metrics for a single tool, or null if it was never called. */
  getToolMetric(tool: string): ToolMetric | null {
    const data = this.metrics.get(tool);
    if (!data) return null;
    return this.calculateMetric(tool, data);
  }

  /** All tool metrics, sorted by call count descending. */
  getAllMetrics(): ToolMetric[] {
    const metrics: ToolMetric[] = [];

    for (const [tool, data] of this.metrics.entries()) {
      metrics.push(this.calculateMetric(tool, data));
    }

    return metrics.sort((a, b) => b.calls - a.calls);
  }

  /** Aggregated LLM API metrics. `calls` is 0 when nothing was recorded. */
  getLLMCallMetric(): ToolMetric {
    return this.calculateMetric('LLM API', this.llmData);
  }

  /** Process-level metrics (uptime + memory). */
  getSystemMetrics(): SystemMetrics {
    const mem = process.memoryUsage();
    return {
      uptime: Date.now() - this.startTime,
      memoryUsageMB: mem.rss / 1024 / 1024,
      heapUsedMB: mem.heapUsed / 1024 / 1024,
      heapTotalMB: mem.heapTotal / 1024 / 1024,
    };
  }

  /** Full performance report. */
  getReport(): PerformanceReport {
    const allMetrics = this.getAllMetrics();
    const totalCalls = allMetrics.reduce((sum, m) => sum + m.calls, 0);
    const totalTime = allMetrics.reduce((sum, m) => sum + m.totalTime, 0);

    // Slow tools: average above 1s, at least 3 calls so one outlier can't qualify.
    const slowTools = allMetrics
      .filter((m) => m.avgTime > 1000 && m.calls >= 3)
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);

    // Error-prone tools: >10% errors over at least 5 calls.
    const errorProneTools = allMetrics
      .filter((m) => m.errorRate > 0.1 && m.calls >= 5)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10);

    return {
      totalCalls,
      totalTime,
      avgTime: totalCalls > 0 ? totalTime / totalCalls : 0,
      tools: allMetrics,
      slowTools,
      errorProneTools,
      topTools: allMetrics.slice(0, 10),
    };
  }

  /** Tools whose average exceeds `thresholdMs` (min 3 calls). */
  getSlowTools(thresholdMs = 1000): ToolMetric[] {
    return this.getAllMetrics()
      .filter((m) => m.avgTime > thresholdMs && m.calls >= 3)
      .sort((a, b) => b.avgTime - a.avgTime);
  }

  /** Tools whose error rate exceeds `minErrorRate` (min 5 calls). */
  getErrorProneTools(minErrorRate = 0.1): ToolMetric[] {
    return this.getAllMetrics()
      .filter((m) => m.errorRate > minErrorRate && m.calls >= 5)
      .sort((a, b) => b.errorRate - a.errorRate);
  }

  /** Drop every recorded metric, including LLM calls. */
  reset(): void {
    this.metrics.clear();
    this.llmData = emptyData();
    this.startTime = Date.now();
  }

  /** Alias of {@link reset}, kept for callers that speak in "clear" terms. */
  clear(): void {
    this.reset();
  }

  /** Drop metrics for a single tool. */
  resetTool(tool: string): void {
    this.metrics.delete(tool);
  }

  /** Enable/disable collection. Disabling does not erase existing data. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Whether collection is currently enabled. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Raw metric data, for persistence or `--json` output. */
  exportData(): Record<string, MetricData> {
    return Object.fromEntries(this.metrics);
  }

  /** Restore metric data produced by {@link exportData}. */
  importData(data: Record<string, MetricData>): void {
    const restored = new Map<string, MetricData>();
    for (const [tool, raw] of Object.entries(data)) {
      // Older exports predate the `samples` window; tolerate their absence.
      restored.set(tool, { ...emptyData(), ...raw, samples: raw.samples ?? [] });
    }
    this.metrics = restored;
  }

  /** Human-readable report. */
  formatReport(): string {
    const report = this.getReport();
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('Tool Performance Report');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Total Calls: ${report.totalCalls}`);
    lines.push(`Total Time: ${(report.totalTime / 1000).toFixed(2)}s`);
    lines.push(`Average Time: ${report.avgTime.toFixed(2)}ms`);
    lines.push('');

    if (report.topTools.length > 0) {
      lines.push('Top 10 Most Used Tools');
      lines.push('-'.repeat(60));
      report.topTools.forEach((m, i) => {
        lines.push(
          `${i + 1}. ${m.tool.padEnd(20)} ${m.calls.toString().padStart(6)} calls  ` +
            `${m.avgTime.toFixed(0).padStart(6)}ms avg  ` +
            `${(m.successRate * 100).toFixed(0)}% success`,
        );
      });
      lines.push('');
    }

    if (report.slowTools.length > 0) {
      lines.push('Slow Tools (>1s average)');
      lines.push('-'.repeat(60));
      report.slowTools.forEach((m, i) => {
        lines.push(
          `${i + 1}. ${m.tool.padEnd(20)} ${(m.avgTime / 1000).toFixed(2)}s avg  ` +
            `${(m.maxTime / 1000).toFixed(2)}s max  ` +
            `${m.calls} calls`,
        );
      });
      lines.push('');
    }

    if (report.errorProneTools.length > 0) {
      lines.push('Error-Prone Tools (>10% error rate)');
      lines.push('-'.repeat(60));
      report.errorProneTools.forEach((m, i) => {
        lines.push(
          `${i + 1}. ${m.tool.padEnd(20)} ${(m.errorRate * 100).toFixed(1)}% errors  ` +
            `${m.errorCount}/${m.calls} failed`,
        );
      });
      lines.push('');
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  private calculateMetric(tool: string, data: MetricData): ToolMetric {
    const avgTime = data.calls > 0 ? data.totalTime / data.calls : 0;
    const successRate = data.calls > 0 ? data.successCount / data.calls : 0;
    const errorRate = data.calls > 0 ? data.errorCount / data.calls : 0;
    const sorted = [...data.samples].sort((a, b) => a - b);

    return {
      tool,
      calls: data.calls,
      totalTime: data.totalTime,
      avgTime,
      minTime: data.minTime === Infinity ? 0 : data.minTime,
      maxTime: data.maxTime,
      p50Time: percentile(sorted, 0.5),
      p95Time: percentile(sorted, 0.95),
      p99Time: percentile(sorted, 0.99),
      successCount: data.successCount,
      errorCount: data.errorCount,
      successRate,
      errorRate,
      lastUsed: data.lastUsed,
    };
  }
}

// ── Convenience functions (used by the agent loop and the /metrics command) ──

export function recordToolExecution(tool: string, duration: number, success: boolean): void {
  ToolMetrics.getInstance().record(tool, duration, success);
}

export function recordLLMCall(duration: number, success: boolean): void {
  ToolMetrics.getInstance().recordLLMCall(duration, success);
}

export function getToolMetrics(): ToolMetrics {
  return ToolMetrics.getInstance();
}

export function getPerformanceReport(): PerformanceReport {
  return ToolMetrics.getInstance().getReport();
}

export function formatPerformanceReport(): string {
  return ToolMetrics.getInstance().formatReport();
}
