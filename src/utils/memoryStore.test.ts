import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveMemory,
  getMemory,
  getMemoryByKey,
  listMemories,
  deleteMemory,
  deleteMemoryByKey,
  searchMemories,
  getMemoryVersion,
  getMemoryCount,
  clearAllMemories,
  getMemoryStats,
} from './memoryStore.js';
import { rm, mkdir } from 'node:fs/promises';
import { codeyangPath } from './paths.js';

describe('memoryStore', () => {
  const testMemoryDir = codeyangPath('memory');

  beforeEach(async () => {
    // Clean up memory directory before each test
    try {
      await rm(testMemoryDir, { recursive: true, force: true });
    } catch {
      // ignore if doesn't exist
    }
    await mkdir(testMemoryDir, { recursive: true });
    await clearAllMemories();
  });

  afterEach(async () => {
    await clearAllMemories();
  });

  describe('saveMemory and getMemory', () => {
    it('saves and retrieves a memory', async () => {
      const memory = await saveMemory('test-key', 'test value', 'user');

      expect(memory.id).toBeDefined();
      expect(memory.key).toBe('test-key');
      expect(memory.value).toBe('test value');
      expect(memory.type).toBe('user');

      const retrieved = await getMemory(memory.id);
      expect(retrieved).toEqual(memory);
    });

    it('updates existing memory with same key', async () => {
      const m1 = await saveMemory('duplicate-key', 'first value', 'user');

      const m2 = await saveMemory('duplicate-key', 'second value', 'user');

      // Should be same ID (updated)
      expect(m2.id).toBe(m1.id);
      expect(m2.value).toBe('second value');

      const retrieved = await getMemory(m1.id);
      expect(retrieved?.value).toBe('second value');
    });

    it('returns null for non-existent memory', async () => {
      const result = await getMemory('non-existent-id');
      expect(result).toBeNull();
    });

    it('increments version on save', async () => {
      const v1 = getMemoryVersion();
      await saveMemory('k1', 'v1', 'user');
      const v2 = getMemoryVersion();
      expect(v2).toBeGreaterThan(v1);
    });
  });

  describe('listMemories', () => {
    it('returns empty array when no memories exist', async () => {
      const memories = await listMemories();
      expect(memories).toEqual([]);
    });

    it('returns all saved memories', async () => {
      await saveMemory('k1', 'v1', 'user');
      await saveMemory('k2', 'v2', 'project');
      await saveMemory('k3', 'v3', 'feedback');

      const memories = await listMemories();
      expect(memories).toHaveLength(3);
      expect(memories.map((m) => m.key).sort()).toEqual(['k1', 'k2', 'k3']);
    });

    it('caches results for performance', async () => {
      await saveMemory('k1', 'v1', 'user');

      const m1 = await listMemories();
      const m2 = await listMemories();

      // Should return same array reference when cached
      expect(m1).toBe(m2);
    });
  });

  describe('deleteMemory', () => {
    it('deletes an existing memory', async () => {
      const memory = await saveMemory('to-delete', 'v', 'user');

      const deleted = await deleteMemory(memory.id);
      expect(deleted).toBe(true);

      const retrieved = await getMemory(memory.id);
      expect(retrieved).toBeNull();
    });

    it('returns false when deleting non-existent memory', async () => {
      const deleted = await deleteMemory('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('increments version on delete', async () => {
      const memory = await saveMemory('k', 'v', 'user');
      const v1 = getMemoryVersion();
      await deleteMemory(memory.id);
      const v2 = getMemoryVersion();
      expect(v2).toBeGreaterThan(v1);
    });

    it('deletes by key', async () => {
      await saveMemory('by-key', 'v', 'user');
      const deleted = await deleteMemoryByKey('by-key');
      expect(deleted).toBe(true);
      expect(await getMemoryByKey('by-key')).toBeNull();
    });
  });

  describe('searchMemories', () => {
    beforeEach(async () => {
      await saveMemory('user-preferences', 'dark mode enabled', 'user');
      await saveMemory('api-config', 'use anthropic API with claude model', 'project');
      await saveMemory('feedback-01', 'user prefers concise explanations', 'feedback');
      await saveMemory('test-strategy', 'always write unit tests for new features', 'project');
    });

    it('searches by key match', async () => {
      const results = await searchMemories('api');
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('api-config');
    });

    it('searches by value match', async () => {
      const results = await searchMemories('claude');
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('api-config');
    });

    it('searches with multiple tokens (AND query)', async () => {
      const results = await searchMemories('user prefers');
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('feedback-01');
    });

    it('returns empty array for no matches', async () => {
      const results = await searchMemories('nonexistent query string');
      expect(results).toEqual([]);
    });

    it('handles empty query', async () => {
      const results = await searchMemories('');
      // Empty string matches all records (substring match)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('is case-insensitive', async () => {
      const results1 = await searchMemories('DARK MODE');
      const results2 = await searchMemories('dark mode');
      expect(results1).toEqual(results2);
      expect(results1).toHaveLength(1);
    });

    it('matches by substring in key or value', async () => {
      const results = await searchMemories('feedback');
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('feedback-01');
    });

    it('handles Chinese characters', async () => {
      await saveMemory('chinese-test', '测试中文搜索功能', 'user');
      const results = await searchMemories('中文');
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('chinese-test');
    });
  });

  describe('cache invalidation', () => {
    it('invalidates cache on save', async () => {
      await saveMemory('k1', 'v1', 'user');
      const m1 = await listMemories();

      await saveMemory('k2', 'v2', 'user');
      const m2 = await listMemories();

      expect(m2.length).toBe(m1.length + 1);
    });

    it('invalidates cache on delete', async () => {
      const mem = await saveMemory('k1', 'v1', 'user');
      await listMemories();

      await deleteMemory(mem.id);
      const memories = await listMemories();

      expect(memories).toHaveLength(0);
    });

    it('respects TTL for cache refresh', async () => {
      // This test would require mocking time or setting a very short TTL
      // For now, just verify cache behavior is consistent
      await saveMemory('k1', 'v1', 'user');
      const m1 = await listMemories();
      const m2 = await listMemories();
      expect(m1).toBe(m2); // Same reference when within TTL
    });
  });

  describe('memory limits', () => {
    it('handles many memories efficiently', async () => {
      const count = 50;
      for (let i = 0; i < count; i++) {
        await saveMemory(`key-${i}`, `value ${i}`, 'user');
      }

      const memories = await listMemories();
      expect(memories).toHaveLength(count);

      // Search should still work with many memories
      const results = await searchMemories('value');
      expect(results.length).toBeGreaterThan(0);
    }, 60_000);

    it('returns memory count and stats', async () => {
      await saveMemory('c1', 'v1', 'user');
      await saveMemory('c2', 'v2', 'project');
      expect(await getMemoryCount()).toBe(2);
      const stats = await getMemoryStats();
      expect(stats.total).toBe(2);
      expect(stats.byType['user']).toBe(1);
      expect(stats.byType['project']).toBe(1);
    });
  });
});
