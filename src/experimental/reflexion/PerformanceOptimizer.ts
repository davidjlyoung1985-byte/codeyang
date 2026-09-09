/**
 * Performance Optimizations for Reflexion Module
 *
 * Features:
 * 1. Result caching with TTL
 * 2. Async batch processing
 * 3. Efficient query optimization
 * 4. Memory-efficient data structures
 * 5. Performance monitoring
 */

import { logger } from '../../utils/logger.js';
import type { Reflection } from './LearningStore.js';
import type { ExecutionRecord } from './ExecutionTracker.js';

export interface CacheConfig {
  enabled: boolean;
  ttlMs: number;
  maxSize: number;
}

export interface BatchConfig {
  enabled: boolean;
  maxBatchSize: number;
  flushIntervalMs: number;
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttlMs: 300000, // 5 minutes
  maxSize: 100,
};

const DEFAULT_BATCH_CONFIG: BatchConfig = {
  enabled: true,
  maxBatchSize: 50,
  flushIntervalMs: 5000, // 5 seconds
};

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

/**
 * LRU Cache with TTL for reflection results
 */
export class ReflectionCache {
  private cache = new Map<string, CacheEntry<Reflection>>();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get cached reflection
   */
  get(key: string): Reflection | null {
    if (!this.config.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.value;
  }

  /**
   * Set cache entry
   */
  set(key: string, value: Reflection): void {
    if (!this.config.enabled) return;

    // Evict if cache is full
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruHits = Infinity;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Prioritize by hits, then by age
      if (entry.hits < lruHits || (entry.hits === lruHits && entry.timestamp < oldestTime)) {
        lruKey = key;
        lruHits = entry.hits;
        oldestTime = entry.timestamp;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalHits = 0;
    const entries = [...this.cache.values()];

    for (const entry of entries) {
      totalHits += entry.hits;
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      totalHits,
      avgHits: entries.length > 0 ? totalHits / entries.length : 0,
    };
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Async batch processor for execution records
 */
export class BatchProcessor {
  private batch: ExecutionRecord[] = [];
  private config: BatchConfig;
  private flushTimer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private processFunc: (records: ExecutionRecord[]) => Promise<void>,
    config: Partial<BatchConfig> = {},
  ) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  /**
   * Add record to batch
   */
  async add(record: ExecutionRecord): Promise<void> {
    if (!this.config.enabled) {
      // Process immediately if batching disabled
      await this.processFunc([record]);
      return;
    }

    this.batch.push(record);

    // Flush if batch is full
    if (this.batch.length >= this.config.maxBatchSize) {
      await this.flush();
      return;
    }

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush().catch((err) => logger.error('[BatchProcessor] Flush error:', err));
      }, this.config.flushIntervalMs);
    }
  }

  /**
   * Flush batch
   */
  async flush(): Promise<void> {
    if (this.processing || this.batch.length === 0) return;

    this.processing = true;

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const recordsToProcess = [...this.batch];
    this.batch = [];

    try {
      await this.processFunc(recordsToProcess);
    } catch (error) {
      logger.error('[BatchProcessor] Processing failed:', error);
      // Re-add failed records to batch
      this.batch.unshift(...recordsToProcess);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get batch statistics
   */
  getStats() {
    return {
      pending: this.batch.length,
      processing: this.processing,
      maxBatchSize: this.config.maxBatchSize,
    };
  }

  /**
   * Shutdown and flush remaining records
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Efficient query optimizer for execution history
 */
export class QueryOptimizer {
  /**
   * Create index for fast lookups
   */
  static createIndex(records: ExecutionRecord[]): Map<string, ExecutionRecord[]> {
    const index = new Map<string, ExecutionRecord[]>();

    for (const record of records) {
      const key = this.getIndexKey(record);
      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key)!.push(record);
    }

    return index;
  }

  /**
   * Get index key for a record
   */
  private static getIndexKey(record: ExecutionRecord): string {
    // Index by tool name for fast tool-based queries
    const toolNames = record.toolCalls.map((tc) => tc.name).join(',');
    return toolNames || 'no-tools';
  }

  /**
   * Fast query by tool name
   */
  static queryByTool(
    records: ExecutionRecord[],
    toolName: string,
    index?: Map<string, ExecutionRecord[]>,
  ): ExecutionRecord[] {
    if (index) {
      // Use index if available
      const results: ExecutionRecord[] = [];
      for (const [key, recs] of index.entries()) {
        if (key.includes(toolName)) {
          results.push(...recs);
        }
      }
      return results;
    }

    // Fallback to linear search
    return records.filter((r) => r.toolCalls.some((tc) => tc.name === toolName));
  }

  /**
   * Fast query by time range
   */
  static queryByTimeRange(records: ExecutionRecord[], startTime: number, endTime: number): ExecutionRecord[] {
    // Binary search for start position
    const startIdx = this.binarySearchByTime(records, startTime);
    const result: ExecutionRecord[] = [];

    for (let i = startIdx; i < records.length && records[i].timestamp <= endTime; i++) {
      result.push(records[i]);
    }

    return result;
  }

  /**
   * Binary search to find first record >= timestamp
   */
  private static binarySearchByTime(records: ExecutionRecord[], timestamp: number): number {
    let left = 0;
    let right = records.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (records[mid].timestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Aggregate statistics efficiently
   */
  static computeAggregates(records: ExecutionRecord[]): {
    totalDuration: number;
    avgDuration: number;
    successCount: number;
    failureCount: number;
    toolUsage: Map<string, number>;
  } {
    let totalDuration = 0;
    let successCount = 0;
    let failureCount = 0;
    const toolUsage = new Map<string, number>();

    for (const record of records) {
      totalDuration += record.durationMs;
      if (record.success) {
        successCount++;
      } else {
        failureCount++;
      }

      for (const toolCall of record.toolCalls) {
        toolUsage.set(toolCall.name, (toolUsage.get(toolCall.name) || 0) + 1);
      }
    }

    return {
      totalDuration,
      avgDuration: records.length > 0 ? totalDuration / records.length : 0,
      successCount,
      failureCount,
      toolUsage,
    };
  }
}

/**
 * Performance monitor for tracking metrics
 */
export class PerformanceMonitor {
  private metrics = new Map<
    string,
    {
      count: number;
      totalMs: number;
      minMs: number;
      maxMs: number;
    }
  >();

  /**
   * Record operation timing
   */
  record(operation: string, durationMs: number): void {
    const existing = this.metrics.get(operation);

    if (existing) {
      existing.count++;
      existing.totalMs += durationMs;
      existing.minMs = Math.min(existing.minMs, durationMs);
      existing.maxMs = Math.max(existing.maxMs, durationMs);
    } else {
      this.metrics.set(operation, {
        count: 1,
        totalMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
      });
    }
  }

  /**
   * Measure operation performance
   */
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.record(operation, Date.now() - start);
    }
  }

  /**
   * Get metrics for an operation
   */
  getMetrics(operation: string) {
    const metrics = this.metrics.get(operation);
    if (!metrics) return null;

    return {
      count: metrics.count,
      avgMs: metrics.totalMs / metrics.count,
      minMs: metrics.minMs,
      maxMs: metrics.maxMs,
      totalMs: metrics.totalMs,
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result: Record<string, ReturnType<typeof this.getMetrics>> = {};

    for (const [operation] of this.metrics.keys()) {
      result[operation] = this.getMetrics(operation);
    }

    return result;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }
}
