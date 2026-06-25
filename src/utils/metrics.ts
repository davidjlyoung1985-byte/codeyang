/**
 * Performance monitoring and metrics collection.
 *
 * Tracks:
 * - Tool execution time
 * - LLM API latency
 * - Memory usage
 * - Error rates
 *
 * Usage:
 *   import { metrics } from './metrics.js';
 *   metrics.recordToolExecution('Read', 45.2, true);
 *   metrics.getReport();
 */

import { performance } from 'node:perf_hooks';

interface MetricEntry {
  timestamp: number;
  value: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

interface ToolMetrics {
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

class MetricsCollector {
  private toolMetrics = new Map<string, MetricEntry[]>();
  private llmMetrics: MetricEntry[] = [];
  private startTime = Date.now();

  /**
   * Record tool execution.
   */
  recordToolExecution(
    toolName: string,
    durationMs: number,
    success: boolean,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.toolMetrics.has(toolName)) {
      this.toolMetrics.set(toolName, []);
    }

    this.toolMetrics.get(toolName)!.push({
      timestamp: Date.now(),
      value: durationMs,
      success,
      metadata,
    });
  }

  /**
   * Record LLM API call.
   */
  recordLLMCall(durationMs: number, success: boolean, metadata?: Record<string, unknown>): void {
    this.llmMetrics.push({
      timestamp: Date.now(),
      value: durationMs,
      success,
      metadata,
    });
  }

  /**
   * Get metrics for specific tool.
   */
  getToolMetrics(toolName: string): ToolMetrics | null {
    const entries = this.toolMetrics.get(toolName);
    if (!entries || entries.length === 0) return null;

    const durations = entries.map((e) => e.value).sort((a, b) => a - b);
    const successCount = entries.filter((e) => e.success).length;
    const failureCount = entries.length - successCount;
    const totalDurationMs = durations.reduce((a, b) => a + b, 0);

    return {
      name: toolName,
      totalCalls: entries.length,
      successCount,
      failureCount,
      totalDurationMs,
      avgDurationMs: totalDurationMs / entries.length,
      minDurationMs: durations[0],
      maxDurationMs: durations[durations.length - 1],
      p50Ms: durations[Math.floor(durations.length * 0.5)],
      p95Ms: durations[Math.floor(durations.length * 0.95)],
      p99Ms: durations[Math.floor(durations.length * 0.99)],
      errorRate: failureCount / entries.length,
    };
  }

  /**
   * Get metrics for all tools.
   */
  getAllToolMetrics(): ToolMetrics[] {
    const results: ToolMetrics[] = [];

    for (const toolName of this.toolMetrics.keys()) {
      const metrics = this.getToolMetrics(toolName);
      if (metrics) results.push(metrics);
    }

    return results.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  /**
   * Get LLM metrics.
   */
  getLLMMetrics(): ToolMetrics {
    const durations = this.llmMetrics.map((e) => e.value).sort((a, b) => a - b);
    const successCount = this.llmMetrics.filter((e) => e.success).length;
    const failureCount = this.llmMetrics.length - successCount;
    const totalDurationMs = durations.reduce((a, b) => a + b, 0);

    return {
      name: 'LLM API',
      totalCalls: this.llmMetrics.length,
      successCount,
      failureCount,
      totalDurationMs,
      avgDurationMs: this.llmMetrics.length > 0 ? totalDurationMs / this.llmMetrics.length : 0,
      minDurationMs: durations[0] || 0,
      maxDurationMs: durations[durations.length - 1] || 0,
      p50Ms: durations[Math.floor(durations.length * 0.5)] || 0,
      p95Ms: durations[Math.floor(durations.length * 0.95)] || 0,
      p99Ms: durations[Math.floor(durations.length * 0.99)] || 0,
      errorRate: this.llmMetrics.length > 0 ? failureCount / this.llmMetrics.length : 0,
    };
  }

  /**
   * Get system metrics (memory, uptime).
   */
  getSystemMetrics(): {
    uptime: number;
    memoryUsageMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
  } {
    const mem = process.memoryUsage();
    return {
      uptime: Date.now() - this.startTime,
      memoryUsageMB: mem.rss / 1024 / 1024,
      heapUsedMB: mem.heapUsed / 1024 / 1024,
      heapTotalMB: mem.heapTotal / 1024 / 1024,
    };
  }

  /**
   * Generate full report.
   */
  getReport(): string {
    const tools = this.getAllToolMetrics();
    const llm = this.getLLMMetrics();
    const system = this.getSystemMetrics();

    let report = '=== Performance Report ===\n\n';

    // System
    report += '┌─ System Metrics ──────────────────────────────────\n';
    report += `│ Uptime:       ${(system.uptime / 1000).toFixed(0)}s\n`;
    report += `│ Memory:       ${system.memoryUsageMB.toFixed(1)} MB\n`;
    report += `│ Heap Used:    ${system.heapUsedMB.toFixed(1)} MB\n`;
    report += `│ Heap Total:   ${system.heapTotalMB.toFixed(1)} MB\n`;
    report += '└───────────────────────────────────────────────────\n\n';

    // LLM
    if (llm.totalCalls > 0) {
      report += '┌─ LLM API Metrics ─────────────────────────────────\n';
      report += `│ Total Calls:  ${llm.totalCalls}\n`;
      report += `│ Success:      ${llm.successCount} (${((llm.successCount / llm.totalCalls) * 100).toFixed(1)}%)\n`;
      report += `│ Failures:     ${llm.failureCount}\n`;
      report += `│ Avg Latency:  ${llm.avgDurationMs.toFixed(0)}ms\n`;
      report += `│ P50:          ${llm.p50Ms.toFixed(0)}ms\n`;
      report += `│ P95:          ${llm.p95Ms.toFixed(0)}ms\n`;
      report += `│ P99:          ${llm.p99Ms.toFixed(0)}ms\n`;
      report += '└───────────────────────────────────────────────────\n\n';
    }

    // Top Tools
    if (tools.length > 0) {
      report += '┌─ Top Tools (by call count) ──────────────────────\n';
      for (const tool of tools.slice(0, 10)) {
        const successRate = ((tool.successCount / tool.totalCalls) * 100).toFixed(0);
        report += `│ ${tool.name.padEnd(20)} ${String(tool.totalCalls).padStart(5)} calls  ${tool.avgDurationMs.toFixed(0).padStart(5)}ms avg  ${successRate}% ok\n`;
      }
      report += '└───────────────────────────────────────────────────\n\n';
    }

    // Slow Tools
    const slowTools = tools.filter((t) => t.avgDurationMs > 100).slice(0, 5);
    if (slowTools.length > 0) {
      report += '┌─ Slowest Tools (>100ms avg) ─────────────────────\n';
      for (const tool of slowTools) {
        report += `│ ${tool.name.padEnd(20)} ${tool.avgDurationMs.toFixed(0).padStart(6)}ms avg  (p95: ${tool.p95Ms.toFixed(0)}ms)\n`;
      }
      report += '└───────────────────────────────────────────────────\n\n';
    }

    // Error-prone Tools
    const errorTools = tools.filter((t) => t.errorRate > 0.1).slice(0, 5);
    if (errorTools.length > 0) {
      report += '┌─ Error-Prone Tools (>10% failure) ───────────────\n';
      for (const tool of errorTools) {
        report += `│ ${tool.name.padEnd(20)} ${(tool.errorRate * 100).toFixed(1)}% error rate  (${tool.failureCount}/${tool.totalCalls})\n`;
      }
      report += '└───────────────────────────────────────────────────\n';
    }

    return report;
  }

  /**
   * Export metrics as JSON.
   */
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

  /**
   * Clear all metrics.
   */
  clear(): void {
    this.toolMetrics.clear();
    this.llmMetrics = [];
    this.startTime = Date.now();
  }
}

// Global singleton
export const metrics = new MetricsCollector();

/**
 * Timer utility for measuring operations.
 */
export function createTimer() {
  const start = performance.now();
  return {
    end: () => performance.now() - start,
  };
}
