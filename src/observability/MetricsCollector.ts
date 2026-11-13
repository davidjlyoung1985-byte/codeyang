/**
 * Metrics Collector
 *
 * Collects and exports application metrics (counters, histograms, gauges).
 * Compatible with Prometheus, Grafana, Datadog, and other monitoring systems.
 */

import { logger } from '../utils/logger.js';

export interface MetricsExporterConfig {
  type: 'prometheus' | 'datadog' | 'statsd' | 'console';
  endpoint?: string;
  apiKey?: string;
  prefix?: string;
  flushInterval?: number;
}

export interface MetricTags {
  [key: string]: string;
}

interface CounterMetric {
  type: 'counter';
  value: number;
  tags: MetricTags;
}

interface HistogramMetric {
  type: 'histogram';
  values: number[];
  tags: MetricTags;
}

interface GaugeMetric {
  type: 'gauge';
  value: number;
  tags: MetricTags;
}

type Metric = CounterMetric | HistogramMetric | GaugeMetric;

/**
 * Metrics Collector for observability
 */
export class MetricsCollector {
  private metrics = new Map<string, Metric>();
  private exporters: MetricsExporterConfig[] = [];
  private flushTimer?: NodeJS.Timeout;
  private prefix: string;

  // Predefined application metrics
  public readonly llmCallDuration: HistogramRecorder;
  public readonly llmCallErrors: CounterRecorder;
  public readonly toolExecutionTime: HistogramRecorder;
  public readonly memoryUsage: GaugeRecorder;
  public readonly activeAgents: GaugeRecorder;
  public readonly httpRequests: CounterRecorder;
  public readonly cacheHits: CounterRecorder;
  public readonly cacheMisses: CounterRecorder;

  constructor(options: { prefix?: string; exporters?: MetricsExporterConfig[] } = {}) {
    this.prefix = options.prefix || 'codeyang';
    this.exporters = options.exporters || [{ type: 'console', flushInterval: 60000 }];

    // Initialize predefined metrics
    this.llmCallDuration = new HistogramRecorder(this, `${this.prefix}.llm.call.duration`);
    this.llmCallErrors = new CounterRecorder(this, `${this.prefix}.llm.call.errors`);
    this.toolExecutionTime = new HistogramRecorder(this, `${this.prefix}.tool.execution.time`);
    this.memoryUsage = new GaugeRecorder(this, `${this.prefix}.memory.usage`);
    this.activeAgents = new GaugeRecorder(this, `${this.prefix}.agents.active`);
    this.httpRequests = new CounterRecorder(this, `${this.prefix}.http.requests`);
    this.cacheHits = new CounterRecorder(this, `${this.prefix}.cache.hits`);
    this.cacheMisses = new CounterRecorder(this, `${this.prefix}.cache.misses`);

    this.startAutoFlush();
    this.startSystemMetrics();
  }

  /**
   * Increment a counter
   */
  counter(name: string, value: number = 1, tags?: MetricTags): void {
    const key = this.makeKey(name, tags);
    const existing = this.metrics.get(key) as CounterMetric | undefined;

    if (existing) {
      existing.value += value;
    } else {
      this.metrics.set(key, {
        type: 'counter',
        value,
        tags: tags || {},
      });
    }
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags?: MetricTags): void {
    const key = this.makeKey(name, tags);
    const existing = this.metrics.get(key) as HistogramMetric | undefined;

    if (existing) {
      existing.values.push(value);
    } else {
      this.metrics.set(key, {
        type: 'histogram',
        values: [value],
        tags: tags || {},
      });
    }
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, tags?: MetricTags): void {
    const key = this.makeKey(name, tags);
    this.metrics.set(key, {
      type: 'gauge',
      value,
      tags: tags || {},
    });
  }

  /**
   * Configure exporter
   */
  configureExporter(config: MetricsExporterConfig): void {
    this.exporters.push(config);
    logger.info(`[Metrics] Configured exporter: ${config.type}`);
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): Record<string, any> {
    const snapshot: Record<string, any> = {};

    for (const [key, metric] of this.metrics.entries()) {
      if (metric.type === 'counter') {
        snapshot[key] = { type: 'counter', value: metric.value, tags: metric.tags };
      } else if (metric.type === 'histogram') {
        const values = metric.values;
        snapshot[key] = {
          type: 'histogram',
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0),
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          p50: this.percentile(values, 50),
          p95: this.percentile(values, 95),
          p99: this.percentile(values, 99),
          tags: metric.tags,
        };
      } else if (metric.type === 'gauge') {
        snapshot[key] = { type: 'gauge', value: metric.value, tags: metric.tags };
      }
    }

    return snapshot;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    logger.debug('[Metrics] All metrics reset');
  }

  /**
   * Flush metrics to exporters
   */
  private async flush(): Promise<void> {
    const snapshot = this.getMetrics();

    for (const exporter of this.exporters) {
      try {
        await this.export(snapshot, exporter);
      } catch (error) {
        logger.error(`[Metrics] Failed to export to ${exporter.type}:`, error);
      }
    }

    // Reset histograms after export (keep counters and gauges)
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.type === 'histogram') {
        metric.values = [];
      }
    }
  }

  /**
   * Export metrics to external service
   */
  private async export(snapshot: Record<string, any>, config: MetricsExporterConfig): Promise<void> {
    if (config.type === 'console') {
      this.exportToConsole(snapshot);
    } else {
      // Placeholder for other exporters
      logger.debug(`[Metrics] Would export to ${config.type}:`, Object.keys(snapshot).length, 'metrics');
    }
  }

  /**
   * Export to console
   */
  private exportToConsole(snapshot: Record<string, any>): void {
    if (Object.keys(snapshot).length === 0) return;

    logger.info('[Metrics] Current metrics:');
    for (const [, data] of Object.entries(snapshot)) {
      if (data.type === 'counter') {
        logger.info(`  ${name}: ${data.value} ${this.formatTags(data.tags)}`);
      } else if (data.type === 'histogram') {
        logger.info(
          `  ${name}: count=${data.count} avg=${data.avg.toFixed(2)} p95=${data.p95.toFixed(2)} ${this.formatTags(data.tags)}`,
        );
      } else if (data.type === 'gauge') {
        logger.info(`  ${name}: ${data.value} ${this.formatTags(data.tags)}`);
      }
    }
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    const flushInterval = this.exporters[0]?.flushInterval || 60000;

    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => logger.error('[Metrics] Auto-flush failed:', err));
    }, flushInterval);

    this.flushTimer.unref();
  }

  /**
   * Start collecting system metrics
   */
  private startSystemMetrics(): void {
    setInterval(() => {
      const mem = process.memoryUsage();
      this.memoryUsage.set(mem.heapUsed, { type: 'heap' });
      this.memoryUsage.set(mem.rss, { type: 'rss' });
      this.memoryUsage.set(mem.external, { type: 'external' });
    }, 10000).unref();
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Make metric key with tags
   */
  private makeKey(name: string, tags?: MetricTags): string {
    if (!tags || Object.keys(tags).length === 0) return name;
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}{${tagStr}}`;
  }

  /**
   * Format tags for display
   */
  private formatTags(tags: MetricTags): string {
    if (!tags || Object.keys(tags).length === 0) return '';
    return `{${Object.entries(tags)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')}}`;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

// Helper classes for type-safe metric recording
class CounterRecorder {
  constructor(
    private collector: MetricsCollector,
    private name: string,
  ) {}
  inc(value: number = 1, tags?: MetricTags): void {
    this.collector.counter(this.name, value, tags);
  }
}

class HistogramRecorder {
  constructor(
    private collector: MetricsCollector,
    private name: string,
  ) {}
  record(value: number, tags?: MetricTags): void {
    this.collector.histogram(this.name, value, tags);
  }
}

class GaugeRecorder {
  constructor(
    private collector: MetricsCollector,
    private name: string,
  ) {}
  set(value: number, tags?: MetricTags): void {
    this.collector.gauge(this.name, value, tags);
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
