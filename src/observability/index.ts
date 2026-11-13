/**
 * Observability Module Index
 *
 * Exports all observability components:
 * - Structured logging with context and sampling
 * - Metrics collection (counters, histograms, gauges)
 * - Alerting and notification management
 */

export {
  StructuredLogger,
  structuredLogger,
  slog,
  LogLevel,
  type LogContext,
  type LogEntry,
  type LogExporterConfig,
  type StructuredLoggerOptions,
} from './StructuredLogger.js';

export { MetricsCollector, metricsCollector, type MetricsExporterConfig, type MetricTags } from './MetricsCollector.js';

export {
  AlertingManager,
  alertingManager,
  AlertSeverity,
  type Alert,
  type AlertRule,
  type AlertChannel,
  type AlertingOptions,
} from './Alerting.js';
