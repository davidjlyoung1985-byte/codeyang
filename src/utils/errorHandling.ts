/**
 * Global error handling utilities
 *
 * Provides:
 * - Error boundaries for graceful degradation
 * - Error logging and reporting
 * - User-friendly error messages
 */

export interface ErrorContext {
  operation: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ErrorReport {
  message: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: ErrorContext;
  stack?: string;
  recoverable: boolean;
}

/**
 * Categorized error types
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error handler class for global error management
 */
export class ErrorHandler {
  private errorLog: ErrorReport[] = [];
  private maxLogSize = 100;

  /**
   * Handle an error with context
   */
  handle(error: unknown, context: Partial<ErrorContext> = {}): ErrorReport {
    const report = this.createReport(error, context);
    this.log(report);
    return report;
  }

  /**
   * Create error report from error object
   */
  private createReport(error: unknown, context: Partial<ErrorContext>): ErrorReport {
    const timestamp = Date.now();
    const operation = context.operation || 'unknown';

    if (error instanceof Error) {
      return {
        message: error.message,
        category: error.name,
        severity: this.determineSeverity(error),
        context: { operation, timestamp, metadata: context.metadata },
        stack: error.stack,
        recoverable: this.isRecoverable(error),
      };
    }

    return {
      message: String(error),
      category: 'UnknownError',
      severity: 'medium',
      context: { operation, timestamp, metadata: context.metadata },
      recoverable: false,
    };
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
    if (error.name === 'SecurityError') return 'critical';
    if (error.name === 'ToolExecutionError') return 'high';
    if (error.name === 'NetworkError') return 'medium';
    if (error.name === 'ValidationError') return 'low';
    return 'medium';
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverable(error: Error): boolean {
    // Security errors are not recoverable
    if (error.name === 'SecurityError') return false;

    // Network errors may be recoverable (retry)
    if (error.name === 'NetworkError') return true;

    // Validation errors are recoverable (fix input)
    if (error.name === 'ValidationError') return true;

    return false;
  }

  /**
   * Log error report
   */
  private log(report: ErrorReport): void {
    this.errorLog.push(report);

    // Keep log size limited
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  /**
   * Get recent error reports
   */
  getRecentErrors(limit = 10): ErrorReport[] {
    return this.errorLog.slice(-limit);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorReport['severity']): ErrorReport[] {
    return this.errorLog.filter((e) => e.severity === severity);
  }

  /**
   * Clear error log
   */
  clear(): void {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   */
  getStats() {
    const total = this.errorLog.length;
    const bySeverity = {
      low: this.getErrorsBySeverity('low').length,
      medium: this.getErrorsBySeverity('medium').length,
      high: this.getErrorsBySeverity('high').length,
      critical: this.getErrorsBySeverity('critical').length,
    };
    const recoverable = this.errorLog.filter((e) => e.recoverable).length;

    return {
      total,
      bySeverity,
      recoverable,
      unrecoverable: total - recoverable,
    };
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * Wrap async function with error boundary
 */
export function withErrorBoundary<T extends (...args: never[]) => Promise<unknown>>(fn: T, operation: string): T {
  return (async (...args: never[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      const report = globalErrorHandler.handle(error, { operation });

      // Log to console for debugging
      console.error(`[${operation}] Error:`, report.message);

      // Re-throw if not recoverable
      if (!report.recoverable) {
        throw error;
      }

      // Return undefined for recoverable errors (graceful degradation)
      return undefined;
    }
  }) as T;
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {},
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      // Calculate backoff delay
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);

      onRetry?.(attempt, error);

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Format error for user display
 */
export function formatUserError(error: unknown): string {
  if (error instanceof Error) {
    // Remove stack trace and technical details
    return error.message;
  }

  return String(error);
}
