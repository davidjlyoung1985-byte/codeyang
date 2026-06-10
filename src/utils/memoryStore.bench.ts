import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  saveMemory,
  searchMemories,
  listMemories,
  getMemory,
  getMemoryByKey,
  deleteMemoryByKey,
} from './memoryStore.js';

const BENCH_COUNT = 100;

describe('MemoryStore benchmarks', () => {
  beforeAll(async () => {
    // Create 100 test memories with varied content for realistic benchmark data
    for (let i = 0; i < BENCH_COUNT; i++) {
      await saveMemory(
        `bench-key-${i}`,
        `benchmark-value-${i}-${'data-'.repeat((i % 10) + 1)}for-testing`,
        i % 3 === 0 ? 'fact' : i % 3 === 1 ? 'preference' : 'project',
      );
    }
  });

  afterAll(async () => {
    // Clean up all benchmark memories
    for (let i = 0; i < BENCH_COUNT; i++) {
      await deleteMemoryByKey(`bench-key-${i}`).catch(() => {});
    }
  });

  it('listMemories under 100ms (cold cache first call)', async () => {
    const start = Date.now();
    const result = await listMemories();
    const elapsed = Date.now() - start;

    // First call includes cold-start: mkdir, readdir, N×readFile, parse, sort, build search index.
    // Subsequent cached calls are <2ms.
    expect(elapsed).toBeLessThan(100);
    expect(result.length).toBeGreaterThanOrEqual(BENCH_COUNT);
  });

  it('listMemories (cached) under 5ms', async () => {
    // Warm the cache
    await listMemories();
    const start = Date.now();
    const result = await listMemories();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5);
    expect(result.length).toBeGreaterThanOrEqual(BENCH_COUNT);
  });

  it('searchMemories (full-text index) under 20ms', async () => {
    const start = Date.now();
    const result = await searchMemories('benchmark');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(20);
    expect(result.length).toBeGreaterThanOrEqual(BENCH_COUNT);
  });

  it('searchMemories (substring fallback) under 20ms', async () => {
    const start = Date.now();
    const result = await searchMemories('testing');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(20);
    expect(result.length).toBeGreaterThanOrEqual(BENCH_COUNT);
  });

  it('getMemoryByKey under 20ms', async () => {
    const start = Date.now();
    const result = await getMemoryByKey('bench-key-42');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(20);
    expect(result).not.toBeNull();
    expect(result!.key).toBe('bench-key-42');
  });

  it('getMemory by id under 20ms', async () => {
    // First get a key to resolve id
    const mem = await getMemoryByKey('bench-key-0');
    expect(mem).not.toBeNull();

    const start = Date.now();
    const result = await getMemory(mem!.id);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(20);
    expect(result).not.toBeNull();
  });
});
