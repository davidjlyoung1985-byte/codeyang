/**
 * Enhanced Error Recovery Manager
 *
 * Provides robust error recovery mechanisms including:
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern
 * - Graceful degradation
 * - Operation timeout management
 */

import { logger } from '../utils/logger.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  retryableErrors: string[]; // Error codes/messages that should trigger retry
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes to close circuit
  timeout: number; // How long to wait before trying again (ms)
}

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Blocking requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by stopping requests to failing services
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 2,
      timeout: options.timeout ?? 60_000, // 1 minute default
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(
          `Circuit breaker is OPEN. Service unavailable until ${new Date(this.nextAttempt).toISOString()}`,
        );
      }
      // Transition to HALF_OPEN to test the service
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info('[CircuitBreaker] Transitioning to HALF_OPEN, testing service recovery');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info('[CircuitBreaker] Service recovered, circuit CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      logger.warn(
        `[CircuitBreaker] Circuit OPEN after ${this.failureCount} failures. Will retry at ${new Date(this.nextAttempt).toISOString()}`,
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }
}

/**
 * Error Recovery Manager
 * Orchestrates retry logic, circuit breakers, and fallback mechanisms
 */
export class ErrorRecoveryManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  /**
   * Retry an operation with exponential backoff
   */
  async retryWithBackoff<T>(operation: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> {
    const opts: RetryOptions = {
      maxRetries: options.maxRetries ?? 3,
      baseDelay: options.baseDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30_000,
      retryableErrors: options.retryableErrors ?? [
        'ETIMEDOUT',
        'ECONNRESET',
        'ENOTFOUND',
        'rate_limit_exceeded',
        '503',
        '429',
      ],
      onRetry: options.onRetry,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = opts.retryableErrors.some(
          (pattern) => lastError!.message.includes(pattern) || lastError!.name.includes(pattern),
        );

        if (!isRetryable || attempt === opts.maxRetries) {
          logger.error(`[ErrorRecovery] Operation failed after ${attempt + 1} attempts:`, lastError);
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay);
        logger.warn(`[ErrorRecovery] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed. Retrying in ${delay}ms...`);

        if (opts.onRetry) {
          opts.onRetry(attempt + 1, lastError);
        }

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>,
  ): Promise<T> {
    let breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {
      breaker = new CircuitBreaker(options);
      this.circuitBreakers.set(serviceName, breaker);
    }

    return breaker.execute(operation);
  }

  /**
   * Execute with primary operation and fallback
   */
  async executeWithFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      logger.warn('[ErrorRecovery] Primary operation failed, using fallback:', error);
      return await fallback();
    }
  }

  /**
   * Execute with timeout
   */
  async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number, timeoutMessage?: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Get circuit breaker state for a service
   */
  getCircuitBreakerState(serviceName: string): CircuitState | null {
    const breaker = this.circuitBreakers.get(serviceName);
    return breaker ? breaker.getState() : null;
  }

  /**
   * Reset circuit breaker for a service
   */
  resetCircuitBreaker(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.reset();
      logger.info(`[ErrorRecovery] Circuit breaker reset for service: ${serviceName}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const errorRecovery = new ErrorRecoveryManager();
