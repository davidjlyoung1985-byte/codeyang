/**
 * Metrics module - single entry point for performance metrics.
 *
 * All collection and aggregation lives in `metrics/ToolMetrics.ts`. This file
 * only re-exports it, so there is exactly one store behind `/metrics`, the
 * agent loop, and the legacy `utils/metrics` call sites.
 */

export {
  ToolMetrics,
  recordToolExecution,
  recordLLMCall,
  getToolMetrics,
  getPerformanceReport,
  formatPerformanceReport,
} from './ToolMetrics.js';

export type { ToolMetric, PerformanceReport, SystemMetrics, MetricData } from './ToolMetrics.js';

/** Timer helper for measuring arbitrary operations. */
export function createTimer(): { end: () => number } {
  const start = performance.now();
  return { end: () => performance.now() - start };
}
