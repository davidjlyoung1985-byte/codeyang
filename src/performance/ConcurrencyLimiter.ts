/**
 * Concurrency Limiter
 *
 * Controls concurrent operations to prevent resource exhaustion.
 * Implements:
 * - Semaphore-based concurrency control
 * - Priority queue for operation scheduling
 * - Timeout management
 */

import { logger } from '../utils/logger.js';

export interface ConcurrencyOptions {
  maxConcurrency: number;
  queueSize?: number; // Max queued operations (0 = unlimited)
  timeout?: number; // Per-operation timeout in ms
}

interface QueuedOperation<T> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: number;
  timeoutId?: NodeJS.Timeout;
  createdAt: number;
}

/**
 * Concurrency Limiter with priority queue
 */
export class ConcurrencyLimiter {
  private maxConcurrency: number;
  private queueSize: number;
  private timeout: number;
  private running = 0;
  private queue: QueuedOperation<any>[] = [];
  private stats = {
    total: 0,
    completed: 0,
    failed: 0,
    timedOut: 0,
    queued: 0,
    rejected: 0,
  };

  constructor(options: ConcurrencyOptions) {
    this.maxConcurrency = options.maxConcurrency;
    this.queueSize = options.queueSize ?? 0; // 0 = unlimited
    this.timeout = options.timeout ?? 30_000;
  }

  /**
   * Execute operation with concurrency control
   */
  async execute<T>(operation: () => Promise<T>, priority: number = 0): Promise<T> {
    this.stats.total++;

    // Check queue size
    if (this.queueSize > 0 && this.queue.length >= this.queueSize) {
      this.stats.rejected++;
      throw new Error(`Queue full: ${this.queue.length} operations waiting`);
    }

    // If we have capacity, run immediately
    if (this.running < this.maxConcurrency) {
      return this.runOperation(operation);
    }

    // Otherwise, queue it
    return this.queueOperation(operation, priority);
  }

  /**
   * Queue an operation
   */
  private queueOperation<T>(operation: () => Promise<T>, priority: number): Promise<T> {
    this.stats.queued++;

    return new Promise((resolve, reject) => {
      const queued: QueuedOperation<T> = {
        operation,
        resolve,
        reject,
        priority,
        createdAt: Date.now(),
      };

      // Insert by priority (higher priority first)
      const insertIndex = this.queue.findIndex((item) => item.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(queued);
      } else {
        this.queue.splice(insertIndex, 0, queued);
      }

      logger.debug(`[ConcurrencyLimiter] Operation queued (priority: ${priority}, queue size: ${this.queue.length})`);
    });
  }

  /**
   * Run an operation
   */
  private async runOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.running++;

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        this.stats.timedOut++;
        reject(new Error(`Operation timed out after ${this.timeout}ms`));
      }, this.timeout);
    });

    try {
      const result = await Promise.race([operation(), timeoutPromise]);
      this.stats.completed++;
      return result;
    } catch (error) {
      this.stats.failed++;
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.running--;
      this.processQueue();
    }
  }

  /**
   * Process queued operations
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.running < this.maxConcurrency) {
      const queued = this.queue.shift()!;
      const waitTime = Date.now() - queued.createdAt;

      if (waitTime > this.timeout) {
        this.stats.timedOut++;
        queued.reject(new Error(`Operation timed out in queue after ${waitTime}ms`));
        continue;
      }

      logger.debug(
        `[ConcurrencyLimiter] Processing queued operation (waited: ${waitTime}ms, remaining: ${this.queue.length})`,
      );

      this.runOperation(queued.operation).then(queued.resolve).catch(queued.reject);
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      running: this.running,
      queued: this.queue.length,
      capacity: this.maxConcurrency - this.running,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      timedOut: 0,
      queued: 0,
      rejected: 0,
    };
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    const cleared = this.queue.length;
    this.queue.forEach((op) => {
      op.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    logger.info(`[ConcurrencyLimiter] Cleared ${cleared} queued operations`);
  }

  /**
   * Wait for all operations to complete
   */
  async waitForCompletion(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * Global limiter instances for different operation types
 */
export const limiters = {
  llm: new ConcurrencyLimiter({ maxConcurrency: 5, queueSize: 20, timeout: 180_000 }),
  tools: new ConcurrencyLimiter({ maxConcurrency: 10, queueSize: 50, timeout: 60_000 }),
  io: new ConcurrencyLimiter({ maxConcurrency: 20, queueSize: 100, timeout: 30_000 }),
};
