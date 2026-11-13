/**
 * Structured Logger
 *
 * Provides JSON-formatted logging with context, sampling, and export capabilities.
 * Compatible with log aggregation systems (ELK, Datadog, Splunk).
 */

import { logger as simpleLogger } from '../utils/logger.js';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  service: string;
  version: string;
  hostname: string;
  pid: number;
  traceId?: string;
  spanId?: string;
}

export interface LogExporterConfig {
  type: 'console' | 'file' | 'http' | 'datadog' | 'elk';
  endpoint?: string;
  apiKey?: string;
  batchSize?: number;
  flushInterval?: number;
}

export interface StructuredLoggerOptions {
  serviceName?: string;
  version?: string;
  minLevel?: LogLevel;
  samplingRate?: number; // 0-1, for high-volume logs
  exporters?: LogExporterConfig[];
}

/**
 * Structured Logger with rich context and export capabilities
 */
export class StructuredLogger {
  private serviceName: string;
  private version: string;
  private minLevel: LogLevel;
  private samplingRate: number;
  private hostname: string;
  private pid: number;
  private logBuffer: LogEntry[] = [];
  private exporters: LogExporterConfig[] = [];
  private flushTimer?: NodeJS.Timeout;

  private levelPriority: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
    [LogLevel.FATAL]: 4,
  };

  constructor(options: StructuredLoggerOptions = {}) {
    this.serviceName = options.serviceName || 'codeyang';
    this.version = options.version || process.env.npm_package_version || '1.0.0';
    this.minLevel = options.minLevel || LogLevel.INFO;
    this.samplingRate = options.samplingRate ?? 1.0;
    this.hostname = this.getHostname();
    this.pid = process.pid;
    this.exporters = options.exporters || [{ type: 'console' }];

    this.startAutoFlush();
  }

  /**
   * Log with context
   */
  log(level: LogLevel, message: string, context: LogContext = {}): void {
    // Check if level is enabled
    if (this.levelPriority[level] < this.levelPriority[this.minLevel]) {
      return;
    }

    // Apply sampling (except for errors)
    if (level !== LogLevel.ERROR && level !== LogLevel.FATAL) {
      if (Math.random() > this.samplingRate) {
        return;
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.sanitizeContext(context),
      service: this.serviceName,
      version: this.version,
      hostname: this.hostname,
      pid: this.pid,
    };

    // Add trace context if available
    if (context.traceId) entry.traceId = context.traceId;
    if (context.spanId) entry.spanId = context.spanId;

    this.emit(entry);
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  fatal(message: string, context?: LogContext): void {
    this.log(LogLevel.FATAL, message, context);
  }

  /**
   * Set sampling rate (0-1)
   */
  setSamplingRate(rate: number): void {
    if (rate < 0 || rate > 1) {
      throw new Error('Sampling rate must be between 0 and 1');
    }
    this.samplingRate = rate;
    simpleLogger.info(`[StructuredLogger] Sampling rate set to ${rate * 100}%`);
  }

  /**
   * Configure exporter
   */
  configureExporter(config: LogExporterConfig): void {
    this.exporters.push(config);
    simpleLogger.info(`[StructuredLogger] Configured exporter: ${config.type}`);
  }

  /**
   * Emit log entry to all exporters
   */
  private emit(entry: LogEntry): void {
    for (const exporter of this.exporters) {
      try {
        switch (exporter.type) {
          case 'console':
            this.exportToConsole(entry);
            break;
          case 'file':
          case 'http':
          case 'datadog':
          case 'elk':
            // Buffer for batch export
            this.logBuffer.push(entry);
            if (this.logBuffer.length >= (exporter.batchSize || 100)) {
              this.flush();
            }
            break;
        }
      } catch (error) {
        simpleLogger.error('[StructuredLogger] Export failed:', error);
      }
    }
  }

  /**
   * Export to console (JSON format)
   */
  private exportToConsole(entry: LogEntry): void {
    const json = JSON.stringify(entry);

    // Also output to simple logger for compatibility
    switch (entry.level) {
      case LogLevel.DEBUG:
        if (process.env.CODEYANG_DEBUG) {
          simpleLogger.debug(`[${entry.context.component || 'app'}] ${entry.message}`, entry.context);
        }
        break;
      case LogLevel.INFO:
        simpleLogger.info(`[${entry.context.component || 'app'}] ${entry.message}`, entry.context);
        break;
      case LogLevel.WARN:
        simpleLogger.warn(`[${entry.context.component || 'app'}] ${entry.message}`, entry.context);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        simpleLogger.error(`[${entry.context.component || 'app'}] ${entry.message}`, entry.context);
        break;
    }

    // In production, output raw JSON
    if (process.env.NODE_ENV === 'production') {
      console.log(json);
    }
  }

  /**
   * Flush buffered logs
   */
  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const batch = [...this.logBuffer];
    this.logBuffer = [];

    for (const exporter of this.exporters) {
      if (exporter.type === 'console') continue;

      try {
        await this.exportBatch(batch, exporter);
      } catch (error) {
        simpleLogger.error(`[StructuredLogger] Failed to export to ${exporter.type}:`, error);
      }
    }
  }

  /**
   * Export batch to external service
   */
  private async exportBatch(batch: LogEntry[], config: LogExporterConfig): Promise<void> {
    // Placeholder for actual implementation
    // In production, implement HTTP POST to logging service
    simpleLogger.debug(`[StructuredLogger] Would export ${batch.length} logs to ${config.type}`);

    // Example HTTP export:
    // if (config.type === 'http' && config.endpoint) {
    //   await fetch(config.endpoint, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
    //     },
    //     body: JSON.stringify(batch)
    //   });
    // }
  }

  /**
   * Sanitize context to remove sensitive data
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};
    const sensitiveKeys = ['password', 'apiKey', 'token', 'secret', 'authorization'];

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((k) => lowerKey.includes(k))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    const flushInterval = this.exporters.find((e) => e.flushInterval)?.flushInterval || 5000;

    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => simpleLogger.error('[StructuredLogger] Auto-flush failed:', err));
    }, flushInterval);

    this.flushTimer.unref();
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

  private getHostname(): string {
    try {
      return require('node:os').hostname();
    } catch {
      return 'unknown';
    }
  }
}

// Singleton instance
export const structuredLogger = new StructuredLogger({
  serviceName: 'codeyang',
  minLevel: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  samplingRate: 1.0,
});

// Convenience exports
export const slog = structuredLogger;
