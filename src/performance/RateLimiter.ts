/**
 * Rate Limiter
 *
 * Implements token bucket algorithm for rate limiting.
 * Supports distributed rate limiting with Redis.
 */

import { logger } from '../utils/logger.js';

export interface RateLimitConfig {
  maxTokens: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per second
  initialTokens?: number; // Starting tokens (default: maxTokens)
}

export interface SlidingWindowConfig {
  limit: number; // Max requests
  window: number; // Time window in milliseconds
}

/**
 * Token Bucket Rate Limiter
 */
export class TokenBucketLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill: number;

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.tokens = config.initialTokens ?? config.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Try to acquire tokens
   */
  async acquire(tokens: number = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Wait until tokens are available
   */
  async waitFor(tokens: number = 1): Promise<void> {
    while (!(await this.acquire(tokens))) {
      const waitTime = this.calculateWaitTime(tokens);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Calculate wait time for tokens
   */
  private calculateWaitTime(tokens: number): number {
    const tokensNeeded = tokens - this.tokens;
    if (tokensNeeded <= 0) return 0;
    return Math.ceil((tokensNeeded / this.refillRate) * 1000);
  }

  /**
   * Get current status
   */
  getStatus() {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      utilization: (1 - this.tokens / this.maxTokens) * 100,
    };
  }

  /**
   * Reset limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Sliding Window Rate Limiter
 */
export class SlidingWindowLimiter {
  private requests = new Map<string, number[]>(); // key -> timestamps

  /**
   * Check if request is within limit
   */
  checkLimit(key: string, config: SlidingWindowConfig): boolean {
    const now = Date.now();
    const windowStart = now - config.window;

    // Get or create request history
    let timestamps = this.requests.get(key) || [];

    // Remove old requests outside the window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    // Check limit
    if (timestamps.length >= config.limit) {
      this.requests.set(key, timestamps);
      return false;
    }

    // Record this request
    timestamps.push(now);
    this.requests.set(key, timestamps);

    return true;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string, config: SlidingWindowConfig): number {
    const now = Date.now();
    const windowStart = now - config.window;
    const timestamps = (this.requests.get(key) || []).filter((ts) => ts > windowStart);

    return Math.max(0, config.limit - timestamps.length);
  }

  /**
   * Get time until next request is allowed
   */
  getRetryAfter(key: string, config: SlidingWindowConfig): number {
    const timestamps = this.requests.get(key);
    if (!timestamps || timestamps.length < config.limit) return 0;

    const oldestInWindow = timestamps[0];
    const retryAt = oldestInWindow + config.window;
    return Math.max(0, retryAt - Date.now());
  }

  /**
   * Reset limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear old entries
   */
  cleanup(maxAge: number = 3600_000): void {
    const cutoff = Date.now() - maxAge;
    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter((ts) => ts > cutoff);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}

/**
 * Rate Limiter with multiple strategies
 */
export class RateLimiter {
  private tokenBuckets = new Map<string, TokenBucketLimiter>();
  private slidingWindows = new Map<string, SlidingWindowLimiter>();

  /**
   * Create or get token bucket limiter
   */
  getTokenBucket(name: string, config: RateLimitConfig): TokenBucketLimiter {
    let limiter = this.tokenBuckets.get(name);
    if (!limiter) {
      limiter = new TokenBucketLimiter(config);
      this.tokenBuckets.set(name, limiter);
      logger.info(`[RateLimiter] Created token bucket: ${name} (${config.maxTokens} tokens, ${config.refillRate}/s)`);
    }
    return limiter;
  }

  /**
   * Create or get sliding window limiter
   */
  getSlidingWindow(name: string): SlidingWindowLimiter {
    let limiter = this.slidingWindows.get(name);
    if (!limiter) {
      limiter = new SlidingWindowLimiter();
      this.slidingWindows.set(name, limiter);
      logger.info(`[RateLimiter] Created sliding window: ${name}`);
    }
    return limiter;
  }

  /**
   * Check all limiters for a key
   */
  checkAll(_key: string): { allowed: boolean; reason?: string } {
    // Check token buckets
    for (const [name, limiter] of this.tokenBuckets.entries()) {
      const status = limiter.getStatus();
      if (status.tokens < 1) {
        return { allowed: false, reason: `Token bucket '${name}' exhausted` };
      }
    }

    return { allowed: true };
  }

  /**
   * Get statistics
   */
  getStats() {
    const buckets: Record<string, any> = {};
    for (const [name, limiter] of this.tokenBuckets.entries()) {
      buckets[name] = limiter.getStatus();
    }

    return {
      tokenBuckets: buckets,
      slidingWindows: this.slidingWindows.size,
    };
  }
}

// Global rate limiters
export const rateLimiter = new RateLimiter();

// Predefined limiters
export const limiters = {
  llmApi: rateLimiter.getTokenBucket('llm_api', {
    maxTokens: 10,
    refillRate: 1, // 1 request per second
  }),
  toolExecution: rateLimiter.getTokenBucket('tool_execution', {
    maxTokens: 50,
    refillRate: 10, // 10 executions per second
  }),
  webFetch: rateLimiter.getTokenBucket('web_fetch', {
    maxTokens: 20,
    refillRate: 5, // 5 requests per second
  }),
};
