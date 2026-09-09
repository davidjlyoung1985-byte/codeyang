/**
 * Enhanced Error Handling for Reflexion Module
 *
 * Features:
 * 1. Retry logic with exponential backoff
 * 2. Circuit breaker pattern
 * 3. Error classification and recovery
 * 4. Graceful degradation
 */

import { logger } from '../../utils/logger.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'rate_limit_error', 'timeout'],
};

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 3,
};

type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit Breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.config.resetTimeoutMs) {
        // Try to recover
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
        logger.debug(`[CircuitBreaker] ${operationName}: Moving to half-open state`);
      } else {
        throw new Error(
          `Circuit breaker is OPEN for ${operationName}. Retry after ${Math.ceil((this.config.resetTimeoutMs - (now - this.lastFailureTime)) / 1000)}s`,
        );
      }
    }

    // Limit requests in half-open state
    if (this.state === 'half-open' && this.halfOpenAttempts >= this.config.halfOpenRequests) {
      throw new Error(`Circuit breaker is in HALF-OPEN state. Max attempts reached.`);
    }

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
    }

    try {
      const result = await operation();
      this.onSuccess(operationName);
      return result;
    } catch (error) {
      this.onFailure(operationName, error);
      throw error;
    }
  }

  private onSuccess(operationName: string): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenRequests) {
        this.state = 'closed';
        this.successCount = 0;
        logger.info(`[CircuitBreaker] ${operationName}: Circuit closed (recovered)`);
      }
    }
  }

  private onFailure(operationName: string, _error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.halfOpenAttempts = 0;
      logger.warn(`[CircuitBreaker] ${operationName}: Circuit opened (half-open failure)`);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      logger.warn(`[CircuitBreaker] ${operationName}: Circuit opened (threshold: ${this.config.failureThreshold})`);
    }

    logger.debug(`[CircuitBreaker] ${operationName}: Failure ${this.failureCount}/${this.config.failureThreshold}`);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
  }
}

/**
 * Enhanced retry logic with exponential backoff
 */
export class RetryHandler {
  constructor(private config: RetryConfig) {}

  /**
   * Execute an operation with retry logic
   */
  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError);

        if (!isRetryable || attempt === this.config.maxAttempts) {
          logger.warn(
            `[RetryHandler] ${operationName}: Failed after ${attempt} attempts${isRetryable ? '' : ' (non-retryable)'}`,
          );
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt);
        logger.debug(
          `[RetryHandler] ${operationName}: Attempt ${attempt}/${this.config.maxAttempts} failed, retrying in ${delay}ms`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Unknown error');
  }

  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    return this.config.retryableErrors.some((retryable) => errorMessage.includes(retryable.toLowerCase()));
  }

  private calculateDelay(attempt: number): number {
    const delay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Error classifier for better error handling
 */
export interface ErrorClassification {
  category: 'transient' | 'permanent' | 'client' | 'server' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
  userMessage: string;
}

export interface ClassifiedError extends Error {
  classification?: ErrorClassification;
}

export class ErrorClassifier {
  /**
   * Classify error into categories
   */
  static classify(error: Error): ErrorClassification {
    const msg = error.message.toLowerCase();

    // Transient errors (network, temporary)
    if (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('network')
    ) {
      return {
        category: 'transient',
        severity: 'medium',
        retryable: true,
        userMessage: 'Network issue detected. Retrying...',
      };
    }

    // Rate limit errors
    if (msg.includes('rate limit') || msg.includes('429')) {
      return {
        category: 'transient',
        severity: 'medium',
        retryable: true,
        userMessage: 'Rate limit reached. Waiting before retry...',
      };
    }

    // Authentication errors (must come before general client errors)
    if (msg.includes('auth') || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('401')) {
      return {
        category: 'client',
        severity: 'critical',
        retryable: false,
        userMessage: 'Authentication failed. Please check your API key.',
      };
    }

    // Client errors (4xx)
    if (
      msg.includes('400') ||
      msg.includes('403') ||
      msg.includes('404') ||
      msg.includes('invalid') ||
      msg.includes('bad request')
    ) {
      return {
        category: 'client',
        severity: 'high',
        retryable: false,
        userMessage: 'Invalid request. Please check your configuration.',
      };
    }

    // Server errors (5xx)
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return {
        category: 'server',
        severity: 'high',
        retryable: true,
        userMessage: 'Server error. Retrying...',
      };
    }

    // Parse errors
    if (msg.includes('parse') || msg.includes('json') || msg.includes('syntax')) {
      return {
        category: 'client',
        severity: 'medium',
        retryable: false,
        userMessage: 'Response parsing failed. Data format issue.',
      };
    }

    // Unknown errors
    return {
      category: 'unknown',
      severity: 'medium',
      retryable: false,
      userMessage: 'An unexpected error occurred.',
    };
  }

  /**
   * Get recovery suggestion for an error
   */
  static getRecoverySuggestion(error: Error): string {
    const classification = this.classify(error);

    switch (classification.category) {
      case 'transient':
        return 'This is a temporary issue. The system will retry automatically.';
      case 'client':
        return 'Please check your request parameters and configuration.';
      case 'server':
        return 'The server is experiencing issues. Please try again later.';
      case 'permanent':
        return 'This operation cannot be completed. Please check the error details.';
      default:
        return 'Please review the error message for more details.';
    }
  }
}

/**
 * Enhanced error handler with retry and circuit breaker
 */
export class EnhancedErrorHandler {
  private circuitBreaker: CircuitBreaker;
  private retryHandler: RetryHandler;

  constructor(retryConfig: Partial<RetryConfig> = {}, circuitBreakerConfig: Partial<CircuitBreakerConfig> = {}) {
    this.retryHandler = new RetryHandler({ ...DEFAULT_RETRY_CONFIG, ...retryConfig });
    this.circuitBreaker = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitBreakerConfig });
  }

  /**
   * Execute operation with full error handling
   */
  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    try {
      return await this.circuitBreaker.execute(
        () => this.retryHandler.execute(operation, operationName),
        operationName,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const classification = ErrorClassifier.classify(err);

      logger.error(`[EnhancedErrorHandler] ${operationName} failed:`, {
        category: classification.category,
        severity: classification.severity,
        retryable: classification.retryable,
        message: err.message,
      });

      // Attach classification to error
      (err as ClassifiedError).classification = classification;
      throw err;
    }
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}
