import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBucketLimiter, SlidingWindowLimiter } from './RateLimiter.js';
import { ConcurrencyLimiter } from './ConcurrencyLimiter.js';
import { IntelligentCache } from './IntelligentCache.js';

describe('TokenBucketLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = new TokenBucketLimiter({ maxTokens: 10, refillRate: 10 });

    const result1 = await limiter.acquire(5);
    const result2 = await limiter.acquire(5);

    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  it('should reject requests exceeding limit', async () => {
    const limiter = new TokenBucketLimiter({ maxTokens: 5, refillRate: 1 });

    await limiter.acquire(5);
    const result = await limiter.acquire(1);

    expect(result).toBe(false);
  });

  it('should refill tokens over time', async () => {
    const limiter = new TokenBucketLimiter({ maxTokens: 10, refillRate: 10 }); // 10 tokens/second

    await limiter.acquire(10); // Exhaust
    await new Promise((resolve) => setTimeout(resolve, 600)); // Wait for ~6 tokens

    const result = await limiter.acquire(5);
    expect(result).toBe(true);
  });

  it('should provide accurate status', async () => {
    const limiter = new TokenBucketLimiter({ maxTokens: 100, refillRate: 10 });

    await limiter.acquire(30);
    const status = limiter.getStatus();

    expect(status.tokens).toBeLessThanOrEqual(70);
    expect(status.maxTokens).toBe(100);
    expect(status.utilization).toBeGreaterThan(0);
  });
});

describe('SlidingWindowLimiter', () => {
  it('should allow requests within window', () => {
    const limiter = new SlidingWindowLimiter();

    const result1 = limiter.checkLimit('user1', { limit: 5, window: 1000 });
    const result2 = limiter.checkLimit('user1', { limit: 5, window: 1000 });

    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  it('should block requests exceeding limit', () => {
    const limiter = new SlidingWindowLimiter();
    const config = { limit: 3, window: 1000 };

    limiter.checkLimit('user1', config);
    limiter.checkLimit('user1', config);
    limiter.checkLimit('user1', config);
    const result = limiter.checkLimit('user1', config);

    expect(result).toBe(false);
  });

  it('should track different keys separately', () => {
    const limiter = new SlidingWindowLimiter();
    const config = { limit: 2, window: 1000 };

    limiter.checkLimit('user1', config);
    limiter.checkLimit('user1', config);
    const user1Blocked = limiter.checkLimit('user1', config);

    const user2Allowed = limiter.checkLimit('user2', config);

    expect(user1Blocked).toBe(false);
    expect(user2Allowed).toBe(true);
  });

  it('should provide remaining count', () => {
    const limiter = new SlidingWindowLimiter();
    const config = { limit: 5, window: 1000 };

    limiter.checkLimit('user1', config);
    limiter.checkLimit('user1', config);

    const remaining = limiter.getRemaining('user1', config);
    expect(remaining).toBe(3);
  });
});

describe('ConcurrencyLimiter', () => {
  it('should limit concurrent operations', async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });
    let concurrent = 0;
    let maxConcurrent = 0;

    const operation = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrent--;
    };

    await Promise.all([
      limiter.execute(operation),
      limiter.execute(operation),
      limiter.execute(operation),
      limiter.execute(operation),
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should handle priority queue', async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });
    const results: number[] = [];

    const operation = (id: number) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(id);
    };

    // Start first operation (will run immediately)
    void limiter.execute(operation(1), 0);

    // Queue these (high priority should run before low)
    void limiter.execute(operation(2), 1); // Low priority
    void limiter.execute(operation(3), 10); // High priority

    await Promise.all([p1, p2, p3]);

    expect(results[0]).toBe(1); // First one
    expect(results[1]).toBe(3); // High priority
    expect(results[2]).toBe(2); // Low priority
  });

  it('should reject when queue is full', async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 1, queueSize: 2 });

    const slowOp = async () => await new Promise((resolve) => setTimeout(resolve, 100));

    limiter.execute(slowOp); // Running
    limiter.execute(slowOp); // Queued 1
    limiter.execute(slowOp); // Queued 2

    await expect(limiter.execute(slowOp)).rejects.toThrow('Queue full');
  });

  it('should timeout long operations', async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 1, timeout: 50 });

    const slowOp = async () => await new Promise((resolve) => setTimeout(resolve, 200));

    await expect(limiter.execute(slowOp)).rejects.toThrow('timed out');
  });

  it('should provide accurate stats', async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });

    const op = async () => await new Promise((resolve) => setTimeout(resolve, 10));

    await Promise.all([limiter.execute(op), limiter.execute(op)]);

    const stats = limiter.getStats();
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(0);
  });
});

describe('IntelligentCache', () => {
  let cache: IntelligentCache<string>;

  beforeEach(() => {
    cache = new IntelligentCache({ maxSize: 5 });
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    const result = cache.get('key1');

    expect(result).toBe('value1');
  });

  it('should return null for missing keys', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should respect TTL', async () => {
    cache.set('key1', 'value1', 50); // 50ms TTL

    expect(cache.get('key1')).toBe('value1');

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(cache.get('key1')).toBeNull();
  });

  it('should evict LRU when full', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');
    cache.set('key5', 'value5');

    // Access key2 and key3 to make them recently used
    cache.get('key2');
    cache.get('key3');

    // Adding key6 should evict key1 (least recently used)
    cache.set('key6', 'value6');

    expect(cache.has('key1')).toBe(false); // key1 was evicted
    expect(cache.has('key2')).toBe(true); // key2 was accessed, still there
    expect(cache.has('key6')).toBe(true); // key6 was just added
    expect(cache.size()).toBe(5); // Still at max size
  });

  it('should support getOrCompute', async () => {
    let computeCount = 0;

    const compute = async () => {
      computeCount++;
      return 'computed';
    };

    const result1 = await cache.getOrCompute('key1', compute);
    const result2 = await cache.getOrCompute('key1', compute);

    expect(result1).toBe('computed');
    expect(result2).toBe('computed');
    expect(computeCount).toBe(1); // Should only compute once
  });

  it('should invalidate by pattern', () => {
    cache.set('user:1', 'data1');
    cache.set('user:2', 'data2');
    cache.set('post:1', 'data3');

    const count = cache.invalidatePattern(/^user:/);

    expect(count).toBe(2);
    expect(cache.has('user:1')).toBe(false);
    expect(cache.has('user:2')).toBe(false);
    expect(cache.has('post:1')).toBe(true);
  });

  it('should track hit rate', () => {
    cache.set('key1', 'value1');

    cache.get('key1'); // Hit
    cache.get('key1'); // Hit
    cache.get('key2'); // Miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe('66.67%');
  });

  it('should cleanup expired entries', async () => {
    cache.set('key1', 'value1', 50);
    cache.set('key2', 'value2', 50);
    cache.set('key3', 'value3'); // No TTL

    await new Promise((resolve) => setTimeout(resolve, 60));

    const removed = cache.cleanup();

    expect(removed).toBe(2);
    expect(cache.size()).toBe(1);
  });
});
