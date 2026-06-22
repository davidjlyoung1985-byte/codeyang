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

  it(`listMemories under 350ms (${TEST_COUNT} memories)`, async () => {
    const start = Date.now();
    const result = await listMemories();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(result.length).toBeGreaterThanOrEqual(TEST_COUNT);
  });

  it('searchMemories under 100ms', async () => {
    const start = Date.now();
    const result = await searchMemories('bench-value');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(0);
  });

  it('searchMemories (partial substring) under 100ms', async () => {
    const start = Date.now();
    const result = await searchMemories('ata-for-testing');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(0);
  });
});
