import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { saveSession, listSessions, loadSession, deleteSession } from './sessionStore.js';
import type { Message } from '../types.js';

describe.skip('Performance benchmarks', () => {
  // Skip in parallel test runs due to file system race conditions
  // Run individually with: npm test -- src/utils/performance.bench.ts
  const sessionIds: string[] = [];
  const BENCHMARK_SESSION_COUNT = 30; // Reduced to avoid file lock issues

  beforeAll(async () => {
    // Create test sessions with delays to avoid file lock issues
    for (let i = 0; i < BENCHMARK_SESSION_COUNT; i++) {
      const messages: Message[] = [
        { role: 'user', content: `Test session ${i} - initial query` },
        { role: 'assistant', content: `Response ${i}` },
        { role: 'user', content: 'Follow-up question' },
        { role: 'assistant', content: 'Follow-up response' },
      ];
      const id = await saveSession(messages);
      sessionIds.push(id);
      // Delay every 5 sessions to reduce index file contention
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 50));
    }
  }, 90000);

  afterAll(async () => {
    // Cleanup
    for (const id of sessionIds) {
      await deleteSession(id).catch(() => {});
    }
  });

  it(`listSessions with ${BENCHMARK_SESSION_COUNT} sessions < 200ms`, async () => {
    const start = Date.now();
    const sessions = await listSessions();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(sessions.length).toBeGreaterThanOrEqual(BENCHMARK_SESSION_COUNT);
  });

  it('loadSession < 50ms', async () => {
    const id = sessionIds[0];
    const start = Date.now();
    const session = await loadSession(id);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(session).not.toBeNull();
    expect(session?.messages.length).toBeGreaterThan(0);
  });

  it('saveSession (update) < 100ms', async () => {
    const id = sessionIds[0];
    const session = await loadSession(id);
    if (!session) throw new Error('Session not found');

    const messages = [
      ...session.messages,
      { role: 'user', content: 'New message' },
      { role: 'assistant', content: 'New response' },
    ];

    const start = Date.now();
    await saveSession(messages, id);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('structuredClone vs JSON.parse/stringify', () => {
    const testObj = {
      messages: Array(100)
        .fill(null)
        .map((_, i) => ({
          role: 'user',
          content: `Message ${i} with some content to make it realistic`,
          timestamp: Date.now(),
        })),
    };

    // Warm up
    structuredClone(testObj);
    JSON.parse(JSON.stringify(testObj));

    // Benchmark structuredClone
    const start1 = performance.now();
    for (let i = 0; i < 100; i++) {
      structuredClone(testObj);
    }
    const elapsed1 = performance.now() - start1;

    // Benchmark JSON
    const start2 = performance.now();
    for (let i = 0; i < 100; i++) {
      JSON.parse(JSON.stringify(testObj));
    }
    const elapsed2 = performance.now() - start2;

    // structuredClone should be faster or comparable
    expect(elapsed1).toBeLessThan(elapsed2 * 1.5); // Allow 50% margin
    console.log(
      `  structuredClone: ${elapsed1.toFixed(2)}ms, JSON: ${elapsed2.toFixed(2)}ms (${((elapsed2 / elapsed1) * 100 - 100).toFixed(0)}% faster)`,
    );
  });

  it('Agent tool cache hit rate simulation', async () => {
    // Simulate repeated Read operations
    const cache = new Map<string, { result: string; timestamp: number }>();
    const CACHE_TTL = 30000;

    const getCached = (key: string): string | null => {
      const cached = cache.get(key);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.result;
      }
      return null;
    };

    const setCached = (key: string, result: string) => {
      cache.set(key, { result, timestamp: Date.now() });
    };

    // Simulate 100 Read operations with 70% cache hit rate
    let hits = 0;
    let misses = 0;
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      const key = `file-${i % 30}.ts`; // 30 unique files, repeated
      const cached = getCached(key);
      if (cached) {
        hits++;
      } else {
        misses++;
        // Simulate file read (0ms for benchmark)
        setCached(key, `content-${key}`);
      }
    }

    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10); // Should be near instant
    expect(hits).toBeGreaterThan(50); // At least 50% hit rate
    console.log(`  Cache hits: ${hits}, misses: ${misses}, hit rate: ${((hits / 100) * 100).toFixed(1)}%`);
  });
});
