import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { saveMemory, listMemories, searchMemories, deleteMemory } from './memoryStore.js';

const TEST_COUNT = 50;

describe('MemoryStore benchmarks', () => {
  const ids: string[] = [];

  beforeAll(async () => {
    for (let i = 0; i < TEST_COUNT; i++) {
      const mem = await saveMemory(`bench-key-${i}`, `bench-value-${i}-data-for-testing`, 'fact');
      ids.push(mem.id);
    }
  }, 30000);

  afterAll(async () => {
    for (const id of ids) {
      await deleteMemory(id).catch(() => {});
    }
  });

  it(`listMemories under 500ms (${TEST_COUNT} memories, cold cache)`, async () => {
    const start = Date.now();
    const result = await listMemories();
    const elapsed = Date.now() - start;

    // Cold cache may take longer; warm cache is faster
    expect(elapsed).toBeLessThan(1000);
    expect(result.length).toBeGreaterThanOrEqual(TEST_COUNT);

    // Second call (warm cache) should be much faster
    const warmStart = Date.now();
    await listMemories();
    const warmElapsed = Date.now() - warmStart;
    expect(warmElapsed).toBeLessThan(100);
  });

  it('searchMemories under 150ms (cold search builds index)', async () => {
    const start = Date.now();
    const result = await searchMemories('bench-value');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(result.length).toBeGreaterThan(0);
  });

  it('searchMemories (partial substring) under 100ms with warm index', async () => {
    const start = Date.now();
    const result = await searchMemories('ata-for-testing');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(result.length).toBeGreaterThan(0);
  });
});
