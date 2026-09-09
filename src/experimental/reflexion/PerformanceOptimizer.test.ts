/**
 * Tests for Performance Optimizer
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReflectionCache, BatchProcessor, QueryOptimizer, PerformanceMonitor } from './PerformanceOptimizer.js';
import type { Reflection } from './LearningStore.js';
import type { ExecutionRecord } from './ExecutionTracker.js';

describe('ReflectionCache', () => {
  let cache: ReflectionCache;

  beforeEach(() => {
    cache = new ReflectionCache({ enabled: true, ttlMs: 1000, maxSize: 3 });
  });

  it('caches and retrieves reflections', () => {
    const reflection: Reflection = {
      id: 'test1',
      timestamp: Date.now(),
      trigger: 'test',
      executionIds: [],
      analysis: 'test analysis',
      patterns: [],
      recommendations: [],
    };

    cache.set('key1', reflection);
    const result = cache.get('key1');

    expect(result).toEqual(reflection);
  });

  it('returns null for non-existent keys', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('expires entries after TTL', async () => {
    const reflection: Reflection = {
      id: 'test1',
      timestamp: Date.now(),
      trigger: 'test',
      executionIds: [],
      analysis: 'test analysis',
      patterns: [],
      recommendations: [],
    };

    cache.set('key1', reflection);
    expect(cache.get('key1')).not.toBeNull();

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(cache.get('key1')).toBeNull();
  });

  it('evicts LRU entry when cache is full', () => {
    const r1: Reflection = {
      id: 'test1',
      timestamp: Date.now(),
      trigger: 'test',
      executionIds: [],
      analysis: 'test1',
      patterns: [],
      recommendations: [],
    };
    const r2: Reflection = { ...r1, id: 'test2', analysis: 'test2' };
    const r3: Reflection = { ...r1, id: 'test3', analysis: 'test3' };
    const r4: Reflection = { ...r1, id: 'test4', analysis: 'test4' };

    cache.set('key1', r1);
    cache.set('key2', r2);
    cache.set('key3', r3);

    // Access key2 to increase its hits
    cache.get('key2');
    cache.get('key2');

    // Adding key4 should evict key1 (least hits)
    cache.set('key4', r4);

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).not.toBeNull();
    expect(cache.get('key3')).not.toBeNull();
    expect(cache.get('key4')).not.toBeNull();
  });

  it('tracks hits correctly', () => {
    const reflection: Reflection = {
      id: 'test1',
      timestamp: Date.now(),
      trigger: 'test',
      executionIds: [],
      analysis: 'test',
      patterns: [],
      recommendations: [],
    };

    cache.set('key1', reflection);
    cache.get('key1');
    cache.get('key1');
    cache.get('key1');

    const stats = cache.getStats();
    expect(stats.totalHits).toBe(3);
  });

  it('clears expired entries', async () => {
    const reflection: Reflection = {
      id: 'test1',
      timestamp: Date.now(),
      trigger: 'test',
      executionIds: [],
      analysis: 'test',
      patterns: [],
      recommendations: [],
    };

    cache.set('key1', reflection);
    cache.set('key2', reflection);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const cleared = cache.clearExpired();
    expect(cleared).toBe(2);
    expect(cache.getStats().size).toBe(0);
  });

  it('provides accurate statistics', () => {
    const reflection: Reflection = {
      id: 'test1',
      timestamp: Date.now(),
      trigger: 'test',
      executionIds: [],
      analysis: 'test',
      patterns: [],
      recommendations: [],
    };

    cache.set('key1', reflection);
    cache.set('key2', reflection);

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(3);
  });

  it('can be disabled', () => {
    const disabledCache = new ReflectionCache({ enabled: false });
    const reflection: Reflection = {
      id: 'test1',
      timestamp: Date.now(),
      trigger: 'test',
      executionIds: [],
      analysis: 'test',
      patterns: [],
      recommendations: [],
    };

    disabledCache.set('key1', reflection);
    expect(disabledCache.get('key1')).toBeNull();
  });
});

describe('BatchProcessor', () => {
  let processor: BatchProcessor;
  let processFunc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    processFunc = vi.fn().mockResolvedValue(undefined);
    processor = new BatchProcessor(processFunc, {
      enabled: true,
      maxBatchSize: 3,
      flushIntervalMs: 100,
    });
  });

  afterEach(async () => {
    await processor.shutdown();
  });

  it('batches records', async () => {
    const record: ExecutionRecord = {
      id: 'exec1',
      timestamp: Date.now(),
      task: 'test',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 100,
    };

    await processor.add(record);
    await processor.add(record);

    expect(processFunc).not.toHaveBeenCalled();
  });

  it('flushes when batch is full', async () => {
    const record: ExecutionRecord = {
      id: 'exec1',
      timestamp: Date.now(),
      task: 'test',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 100,
    };

    await processor.add(record);
    await processor.add(record);
    await processor.add(record);

    expect(processFunc).toHaveBeenCalledTimes(1);
    expect(processFunc).toHaveBeenCalledWith([record, record, record]);
  });

  it('flushes after interval', async () => {
    const record: ExecutionRecord = {
      id: 'exec1',
      timestamp: Date.now(),
      task: 'test',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 100,
    };

    await processor.add(record);

    // Wait for flush interval
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(processFunc).toHaveBeenCalledTimes(1);
  });

  it('processes immediately when disabled', async () => {
    const immediateProcessor = new BatchProcessor(processFunc, { enabled: false });
    const record: ExecutionRecord = {
      id: 'exec1',
      timestamp: Date.now(),
      task: 'test',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 100,
    };

    await immediateProcessor.add(record);

    expect(processFunc).toHaveBeenCalledTimes(1);
    expect(processFunc).toHaveBeenCalledWith([record]);
  });

  it('provides accurate statistics', async () => {
    const record: ExecutionRecord = {
      id: 'exec1',
      timestamp: Date.now(),
      task: 'test',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 100,
    };

    await processor.add(record);
    await processor.add(record);

    const stats = processor.getStats();
    expect(stats.pending).toBe(2);
    expect(stats.maxBatchSize).toBe(3);
  });

  it('handles processing errors gracefully', async () => {
    const failingFunc = vi.fn().mockRejectedValue(new Error('process failed'));
    const errorProcessor = new BatchProcessor(failingFunc, { maxBatchSize: 2 });

    const record: ExecutionRecord = {
      id: 'exec1',
      timestamp: Date.now(),
      task: 'test',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 100,
    };

    await errorProcessor.add(record);
    await errorProcessor.add(record);

    // Records should be re-added to batch after failure
    const stats = errorProcessor.getStats();
    expect(stats.pending).toBe(2);

    await errorProcessor.shutdown();
  });
});

describe('QueryOptimizer', () => {
  let records: ExecutionRecord[];

  beforeEach(() => {
    records = [
      {
        id: 'exec1',
        timestamp: 1000,
        task: 'task1',
        toolCalls: [{ name: 'Bash', args: {} }],
        results: [],
        success: true,
        durationMs: 100,
      },
      {
        id: 'exec2',
        timestamp: 2000,
        task: 'task2',
        toolCalls: [{ name: 'Read', args: {} }],
        results: [],
        success: false,
        durationMs: 200,
      },
      {
        id: 'exec3',
        timestamp: 3000,
        task: 'task3',
        toolCalls: [{ name: 'Bash', args: {} }],
        results: [],
        success: true,
        durationMs: 150,
      },
    ];
  });

  it('creates index for fast lookups', () => {
    const index = QueryOptimizer.createIndex(records);
    expect(index.size).toBeGreaterThan(0);
  });

  it('queries by tool name efficiently', () => {
    const index = QueryOptimizer.createIndex(records);
    const bashRecords = QueryOptimizer.queryByTool(records, 'Bash', index);

    expect(bashRecords).toHaveLength(2);
    expect(bashRecords.every((r) => r.toolCalls.some((tc) => tc.name === 'Bash'))).toBe(true);
  });

  it('queries by time range', () => {
    const result = QueryOptimizer.queryByTimeRange(records, 1500, 2500);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('exec2');
  });

  it('computes aggregates efficiently', () => {
    const aggregates = QueryOptimizer.computeAggregates(records);

    expect(aggregates.totalDuration).toBe(450);
    expect(aggregates.avgDuration).toBe(150);
    expect(aggregates.successCount).toBe(2);
    expect(aggregates.failureCount).toBe(1);
    expect(aggregates.toolUsage.get('Bash')).toBe(2);
    expect(aggregates.toolUsage.get('Read')).toBe(1);
  });
});

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  it('records operation timing', () => {
    monitor.record('test-op', 100);
    monitor.record('test-op', 200);
    monitor.record('another-op', 150);

    const metrics = monitor.getMetrics('test-op');
    expect(metrics).not.toBeNull();
    expect(metrics!.count).toBe(2);
    expect(metrics!.avgMs).toBe(150);
    expect(metrics!.minMs).toBe(100);
    expect(metrics!.maxMs).toBe(200);

    const anotherMetrics = monitor.getMetrics('another-op');
    expect(anotherMetrics).not.toBeNull();
    expect(anotherMetrics!.count).toBe(1);
  });

  it('measures async operations', async () => {
    await monitor.measure('async-op', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'result';
    });

    const metrics = monitor.getMetrics('async-op');
    expect(metrics).not.toBeNull();
    expect(metrics!.count).toBe(1);
    expect(metrics!.avgMs).toBeGreaterThanOrEqual(50);
  });

  it('returns null for non-existent operations', () => {
    const metrics = monitor.getMetrics('nonexistent');
    expect(metrics).toBeNull();
  });

  it('clears all metrics', () => {
    monitor.record('test', 100);
    monitor.clear();

    const metrics = monitor.getMetrics('test');
    expect(metrics).toBeNull();
  });
});
