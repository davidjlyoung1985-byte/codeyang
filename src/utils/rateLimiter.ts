/**
 * Rate limiter for tool calls to prevent DoS attacks via AI-generated spam.
 *
 * Tracks tool call counts per category within a sliding time window.
 * Uses a deque structure for O(1) amortized expiry — only expired
 * entries at the front are removed, avoiding full-array iteration.
 */

interface RateLimitConfig {
  maxCalls: number;
  windowMs: number;
}

// Rate limits per tool category (calls per minute)
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  file: { maxCalls: 100, windowMs: 60_000 }, // 100 file ops/min
  network: { maxCalls: 50, windowMs: 60_000 }, // 50 network requests/min
  bash: { maxCalls: 30, windowMs: 60_000 }, // 30 shell commands/min
  git: { maxCalls: 50, windowMs: 60_000 }, // 50 git ops/min
  mcp: { maxCalls: 100, windowMs: 60_000 }, // 100 MCP calls/min
};

/**
 * Sliding window rate tracker using a deque of timestamps.
 *
 * 原理：每次 check 时先剔除队头过期的条目（O(k)，k=过期条目数），
 * 而非遍历整个数组（O(n)）。平均每次操作 O(1)。
 */
class SlidingWindowTracker {
  private timestamps: number[] = []; // 有序的时间戳队列（升序）
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /** 检查当前是否允许调用，如允许则记录一次调用 */
  check(): void {
    const now = Date.now();
    const windowEnd = now - this.config.windowMs;

    // 从队头移除过期的时间戳（O(k)，k=过期数量）
    while (this.timestamps.length > 0 && this.timestamps[0] <= windowEnd) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.config.maxCalls) {
      // 计算最早的可用时间
      const oldest = this.timestamps[0];
      const waitMs = oldest + this.config.windowMs - now;
      throw new Error(
        `[RATE LIMIT] Too many operations. ` +
          `Limit: ${this.config.maxCalls} calls per ${this.config.windowMs / 1000}s. ` +
          `Wait ~${Math.ceil(waitMs / 1000)}s before retrying.`,
      );
    }

    this.timestamps.push(now);
  }

  /** 重置跟踪器 */
  reset(): void {
    this.timestamps = [];
  }

  /** 获取当前统计 */
  getStats(): { current: number; max: number; windowMs: number } {
    const now = Date.now();
    const windowEnd = now - this.config.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] <= windowEnd) {
      this.timestamps.shift();
    }
    return {
      current: this.timestamps.length,
      max: this.config.maxCalls,
      windowMs: this.config.windowMs,
    };
  }
}

// Store per-category trackers (lazily created)
const trackers = new Map<string, SlidingWindowTracker>();

function getTracker(category: string): SlidingWindowTracker | null {
  const config = RATE_LIMITS[category];
  if (!config) return null;
  let tracker = trackers.get(category);
  if (!tracker) {
    tracker = new SlidingWindowTracker(config);
    trackers.set(category, tracker);
  }
  return tracker;
}

/**
 * Check if a tool call is within rate limits.
 * Throws an error if limit exceeded.
 */
export function checkRateLimit(category: string): void {
  const tracker = getTracker(category);
  if (!tracker) return; // No limit configured for this category
  tracker.check();
}

/**
 * Reset rate limits for a specific category (for testing).
 */
export function resetRateLimit(category?: string): void {
  if (category) {
    trackers.delete(category);
  } else {
    trackers.clear();
  }
}

/**
 * Get current usage stats for a category.
 */
export function getRateLimitStats(category: string): { current: number; max: number; windowMs: number } | null {
  const tracker = getTracker(category);
  if (!tracker) return null;
  return tracker.getStats();
}
