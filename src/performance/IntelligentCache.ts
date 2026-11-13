/**
 * Intelligent Cache
 *
 * Multi-strategy caching with:
 * - LRU (Least Recently Used) eviction
 * - TTL (Time To Live) expiration
 * - Cache warming
 * - Pattern-based invalidation
 * - Statistics tracking
 */

import { logger } from '../utils/logger.js';

export interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
  lastAccessed: number;
  hitCount: number;
}

export interface CacheOptions {
  maxSize?: number; // Max entries
  defaultTTL?: number; // Default TTL in milliseconds
  onEvict?: (key: string, value: any) => void;
}

/**
 * LRU Cache with TTL support
 */
export class IntelligentCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTL?: number;
  private onEvict?: (key: string, value: T) => void;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
    sets: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTTL = options.defaultTTL;
    this.onEvict = options.onEvict;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    this.stats.sets++;

    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const expiresAt = ttl !== undefined ? Date.now() + ttl : this.defaultTTL ? Date.now() + this.defaultTTL : undefined;

    this.cache.set(key, {
      value,
      expiresAt,
      lastAccessed: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Update access time and hit count
    entry.lastAccessed = Date.now();
    entry.hitCount++;
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Check if key exists (without updating access time)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expirations++;
      return false;
    }

    return true;
  }

  /**
   * Delete a key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    logger.info('[IntelligentCache] Cache cleared');
  }

  /**
   * Get or compute value
   */
  async getOrCompute(key: string, compute: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await compute();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Warm cache with multiple keys
   */
  async warmup(keys: string[], loader: (key: string) => Promise<T>): Promise<void> {
    logger.info(`[IntelligentCache] Warming up cache with ${keys.length} keys`);

    const promises = keys.map(async (key) => {
      try {
        const value = await loader(key);
        this.set(key, value);
      } catch (error) {
        logger.error(`[IntelligentCache] Failed to warm key '${key}':`, error);
      }
    });

    await Promise.all(promises);
    logger.info(`[IntelligentCache] Cache warmup complete`);
  }

  /**
   * Invalidate keys matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`[IntelligentCache] Invalidated ${count} keys matching pattern: ${pattern}`);
    }

    return count;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      const entry = this.cache.get(lruKey)!;
      this.cache.delete(lruKey);
      this.stats.evictions++;

      if (this.onEvict) {
        this.onEvict(lruKey, entry.value);
      }

      logger.debug(`[IntelligentCache] Evicted LRU key: ${lruKey}`);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.expirations++;
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`[IntelligentCache] Cleaned up ${removed} expired entries`);
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate =
      this.stats.hits + this.stats.misses > 0 ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: (this.cache.size / this.maxSize) * 100,
      hitRate: hitRate.toFixed(2) + '%',
      ...this.stats,
    };
  }

  /**
   * Get top N most accessed keys
   */
  getTopKeys(n: number = 10): Array<{ key: string; hitCount: number }> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, hitCount: entry.hitCount }))
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, n);

    return entries;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
    };
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * Global cache instances
 */
export const caches = {
  // LLM response cache (5 minute TTL)
  llmResponses: new IntelligentCache<string>({
    maxSize: 100,
    defaultTTL: 5 * 60 * 1000,
  }),

  // Tool result cache (10 minute TTL)
  toolResults: new IntelligentCache<any>({
    maxSize: 500,
    defaultTTL: 10 * 60 * 1000,
  }),

  // File content cache (1 minute TTL)
  fileContents: new IntelligentCache<string>({
    maxSize: 200,
    defaultTTL: 60 * 1000,
  }),

  // Web fetch cache (30 minute TTL)
  webFetch: new IntelligentCache<string>({
    maxSize: 100,
    defaultTTL: 30 * 60 * 1000,
  }),
};

/**
 * Start periodic cleanup
 */
export function startCacheCleanup(intervalMs: number = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    let totalCleaned = 0;
    for (const cache of Object.values(caches)) {
      totalCleaned += cache.cleanup();
    }
    if (totalCleaned > 0) {
      logger.debug(`[Cache] Cleaned ${totalCleaned} expired entries across all caches`);
    }
  }, intervalMs);

  timer.unref();
  return timer;
}
