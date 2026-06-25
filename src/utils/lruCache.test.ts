import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache, generateCacheKey } from './lruCache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3, 1000); // 3 items, 1s TTL
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should update existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
      expect(cache.delete('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
    });

    it('should check key existence', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when at capacity', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // key1 should be evicted

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update access order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to move it to end
      cache.get('key1');

      // key2 should be evicted (least recent)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update access order on set', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update key1 to move it to end
      cache.set('key1', 'value1-updated');

      // key2 should be evicted
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1-updated');
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      vi.useFakeTimers();
      cache.set('key1', 'value1');

      // Advance time by 1.5 seconds (TTL is 1s)
      vi.advanceTimersByTime(1500);

      expect(cache.get('key1')).toBeNull();
      vi.useRealTimers();
    });

    it('should not expire entries before TTL', async () => {
      vi.useFakeTimers();
      cache.set('key1', 'value1');

      // Advance time by 0.5 seconds
      vi.advanceTimersByTime(500);

      expect(cache.get('key1')).toBe('value1');
      vi.useRealTimers();
    });

    it('should prune expired entries', async () => {
      vi.useFakeTimers();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(1500);

      const pruned = cache.prune();
      expect(pruned).toBe(2);
      expect(cache.size()).toBe(0);
      vi.useRealTimers();
    });

    it('should prune only expired entries', async () => {
      vi.useFakeTimers();
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(500);
      cache.set('key2', 'value2'); // Fresh entry

      vi.advanceTimersByTime(600); // key1 expired, key2 still fresh

      const pruned = cache.prune();
      expect(pruned).toBe(1);
      expect(cache.size()).toBe(1);
      expect(cache.get('key2')).toBe('value2');
      vi.useRealTimers();
    });
  });

  describe('statistics', () => {
    it('should track cache stats', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss

      const stats = cache.stats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(3);
      expect(stats.totalAccesses).toBe(2);
    });

    it('should calculate hit rate', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // access count = 1

      const stats = cache.stats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });
});

describe('generateCacheKey', () => {
  it('should generate consistent keys for same inputs', () => {
    const key1 = generateCacheKey('Read', { path: '/foo', limit: 100 });
    const key2 = generateCacheKey('Read', { path: '/foo', limit: 100 });
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different inputs', () => {
    const key1 = generateCacheKey('Read', { path: '/foo' });
    const key2 = generateCacheKey('Read', { path: '/bar' });
    expect(key1).not.toBe(key2);
  });

  it('should handle argument order independence', () => {
    const key1 = generateCacheKey('Tool', { a: 1, b: 2 });
    const key2 = generateCacheKey('Tool', { b: 2, a: 1 });
    expect(key1).toBe(key2);
  });

  it('should include tool name in key', () => {
    const key1 = generateCacheKey('Read', { path: '/foo' });
    const key2 = generateCacheKey('Write', { path: '/foo' });
    expect(key1).not.toBe(key2);
  });
});
