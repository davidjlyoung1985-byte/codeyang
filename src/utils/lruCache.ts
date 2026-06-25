/**
 * LRU Cache for tool results.
 *
 * Caches idempotent tool results to avoid redundant operations.
 * Useful for:
 * - Read operations (same file read multiple times)
 * - Git status (unchanged repo)
 * - Network requests (static resources)
 *
 * Usage:
 *   const cache = new LRUCache<string>(100, 10_000); // 100 items, 10s TTL
 *   const cached = cache.get(key);
 *   if (cached) return cached;
 *   const result = await expensiveOperation();
 *   cache.set(key, result);
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = []; // Most recent at end

  constructor(
    private maxSize: number,
    private ttlMs: number,
  ) {}

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return null;
    }

    // Update access order (move to end = most recent)
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
    entry.accessCount++;

    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const existing = this.cache.get(key);
    if (existing) {
      // Update existing
      existing.value = value;
      existing.timestamp = Date.now();
      this.removeFromAccessOrder(key);
      this.accessOrder.push(key);
    } else {
      // Insert new
      this.cache.set(key, {
        value,
        timestamp: Date.now(),
        accessCount: 0,
      });
      this.accessOrder.push(key);
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  /** Get cache statistics */
  stats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalAccesses: number;
  } {
    let totalAccesses = 0;
    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
    }
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalAccesses > 0 ? totalAccesses / (totalAccesses + this.cache.size) : 0,
      totalAccesses,
    };
  }

  /** Remove expired entries */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        pruned++;
      }
    }

    return pruned;
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    // Remove least recently used (first in array)
    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}

/**
 * Generate cache key for tool invocation.
 * Format: toolName:hash(args)
 */
export function generateCacheKey(toolName: string, args: Record<string, unknown>): string {
  // Simple hash (not cryptographic, just for cache key)
  const argsStr = JSON.stringify(args, Object.keys(args).sort());
  const hash = simpleHash(argsStr);
  return `${toolName}:${hash}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
