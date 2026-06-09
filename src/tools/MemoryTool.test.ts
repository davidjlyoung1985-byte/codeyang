import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRemember, executeRecall, executeForget, executeListMemories } from './MemoryTool.js';

// ──────────────────────────────────────────────
// Mock memoryStore module
// ──────────────────────────────────────────────

const mockSaveMemory = vi.fn();
const mockGetMemory = vi.fn();
const mockGetMemoryByKey = vi.fn();
const mockListMemories = vi.fn();
const mockSearchMemories = vi.fn();
const mockDeleteMemory = vi.fn();
const mockDeleteMemoryByKey = vi.fn();

vi.mock('../utils/memoryStore.js', () => ({
  saveMemory: (...args: unknown[]) => mockSaveMemory(...args),
  getMemory: (...args: unknown[]) => mockGetMemory(...args),
  getMemoryByKey: (...args: unknown[]) => mockGetMemoryByKey(...args),
  listMemories: (...args: unknown[]) => mockListMemories(...args),
  searchMemories: (...args: unknown[]) => mockSearchMemories(...args),
  deleteMemory: (...args: unknown[]) => mockDeleteMemory(...args),
  deleteMemoryByKey: (...args: unknown[]) => mockDeleteMemoryByKey(...args),
}));

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const fakeMemory = (
  overrides: Partial<{
    id: string;
    key: string;
    value: string;
    type: string;
    createdAt: string;
    updatedAt: string;
  }> = {},
) => ({
  id: 'mem-1',
  key: 'test-key',
  value: 'test value',
  type: 'fact',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('MemoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeRemember', () => {
    it('saves a memory with key, value, and default type (fact)', async () => {
      const mem = fakeMemory();
      mockSaveMemory.mockResolvedValue(mem);

      const result = await executeRemember({ key: 'test-key', value: 'test value' });

      expect(mockSaveMemory).toHaveBeenCalledWith('test-key', 'test value', 'fact');
      expect(result).toBe(JSON.stringify({ id: mem.id, key: mem.key, type: mem.type }));
    });

    it('saves a memory with a custom type', async () => {
      const mem = fakeMemory({ type: 'preference' });
      mockSaveMemory.mockResolvedValue(mem);

      const result = await executeRemember({ key: 'color', value: 'blue', type: 'preference' });

      expect(mockSaveMemory).toHaveBeenCalledWith('color', 'blue', 'preference');
      expect(result).toBe(JSON.stringify({ id: mem.id, key: mem.key, type: mem.type }));
    });

    it('falls back to "fact" for invalid type', async () => {
      const mem = fakeMemory({ type: 'fact' });
      mockSaveMemory.mockResolvedValue(mem);

      const result = await executeRemember({ key: 'x', value: 'y', type: 'invalid_type' });

      expect(mockSaveMemory).toHaveBeenCalledWith('x', 'y', 'fact');
      expect(result).toContain('"type":"fact"');
    });

    it('returns error when key is missing', async () => {
      const result = await executeRemember({ value: 'no key' });
      expect(result).toBe('{"error":"key and value are required"}');
      expect(mockSaveMemory).not.toHaveBeenCalled();
    });

    it('returns error when value is missing', async () => {
      const result = await executeRemember({ key: 'no-val' });
      expect(result).toBe('{"error":"key and value are required"}');
      expect(mockSaveMemory).not.toHaveBeenCalled();
    });

    it('trims whitespace from key and value', async () => {
      const mem = fakeMemory({ key: 'trimmed', value: 'ok' });
      mockSaveMemory.mockResolvedValue(mem);

      await executeRemember({ key: '  trimmed  ', value: '  ok  ' });

      expect(mockSaveMemory).toHaveBeenCalledWith('trimmed', 'ok', 'fact');
    });
  });

  describe('executeRecall', () => {
    it('retrieves a memory by id', async () => {
      const mem = fakeMemory({ id: 'mem-42' });
      mockGetMemory.mockResolvedValue(mem);

      const result = await executeRecall({ id: 'mem-42' });

      expect(mockGetMemory).toHaveBeenCalledWith('mem-42');
      expect(result).toBe(JSON.stringify(mem));
    });

    it('returns error when memory by id is not found', async () => {
      mockGetMemory.mockResolvedValue(null);

      const result = await executeRecall({ id: 'nonexistent' });

      expect(result).toBe('{"error":"memory not found"}');
    });

    it('searches memories by query', async () => {
      const mems = [fakeMemory({ id: 'm1', key: 'foo', value: 'bar' })];
      mockSearchMemories.mockResolvedValue(mems);

      const result = await executeRecall({ query: 'foo' });

      expect(mockSearchMemories).toHaveBeenCalledWith('foo');
      expect(result).toBe(JSON.stringify(mems));
    });

    it('falls back to getMemoryByKey when search returns empty', async () => {
      const mem = fakeMemory({ id: 'm2', key: 'exact-key' });
      mockSearchMemories.mockResolvedValue([]);
      mockGetMemoryByKey.mockResolvedValue(mem);

      const result = await executeRecall({ query: 'exact-key' });

      expect(mockGetMemoryByKey).toHaveBeenCalledWith('exact-key');
      expect(result).toBe(JSON.stringify(mem));
    });

    it('lists all memories when no id or query given', async () => {
      const mems = [fakeMemory({ id: 'a' }), fakeMemory({ id: 'b' })];
      mockListMemories.mockResolvedValue(mems);

      const result = await executeRecall({});

      expect(mockListMemories).toHaveBeenCalled();
      expect(result).toBe(JSON.stringify(mems));
    });
  });

  describe('executeForget', () => {
    it('deletes a memory by id', async () => {
      mockDeleteMemory.mockResolvedValue(true);

      const result = await executeForget({ id: 'mem-1' });

      expect(mockDeleteMemory).toHaveBeenCalledWith('mem-1');
      expect(result).toBe(JSON.stringify({ deleted: true, id: 'mem-1' }));
    });

    it('deletes a memory by key when id delete fails', async () => {
      mockDeleteMemory.mockResolvedValue(false);
      mockDeleteMemoryByKey.mockResolvedValue(true);

      const result = await executeForget({ key: 'test-key' });

      expect(mockDeleteMemory).toHaveBeenCalledWith('test-key');
      expect(mockDeleteMemoryByKey).toHaveBeenCalledWith('test-key');
      expect(result).toBe(JSON.stringify({ deleted: true, key: 'test-key' }));
    });

    it('returns deleted:false when neither id nor key matches', async () => {
      mockDeleteMemory.mockResolvedValue(false);
      mockDeleteMemoryByKey.mockResolvedValue(false);

      const result = await executeForget({ key: 'missing-key' });

      expect(result).toBe(JSON.stringify({ deleted: false, key: 'missing-key' }));
    });

    it('returns error when no key or id provided', async () => {
      const result = await executeForget({});

      expect(result).toBe('{"error":"key or id is required"}');
      expect(mockDeleteMemory).not.toHaveBeenCalled();
    });

    it('favors "key" over "id" when both provided (key used as id first)', async () => {
      mockDeleteMemory.mockResolvedValue(true);

      const result = await executeForget({ key: 'my-key', id: 'my-id' });

      // "key" wins because args are spread into String() — last wins with same key name
      // Actually looking at the code: `args['key'] ?? args['id']` — so 'key' takes priority
      expect(mockDeleteMemory).toHaveBeenCalledWith('my-key');
      expect(result).toContain('"deleted":true');
    });
  });

  describe('executeListMemories', () => {
    it('lists all memories when no type filter', async () => {
      const mems = [fakeMemory({ id: 'm1', type: 'fact' }), fakeMemory({ id: 'm2', type: 'preference' })];
      mockListMemories.mockResolvedValue(mems);

      const result = await executeListMemories({});

      expect(result).toBe(JSON.stringify(mems));
    });

    it('filters memories by type', async () => {
      const mems = [
        fakeMemory({ id: 'm1', type: 'fact' }),
        fakeMemory({ id: 'm2', type: 'preference' }),
        fakeMemory({ id: 'm3', type: 'fact' }),
      ];
      mockListMemories.mockResolvedValue(mems);

      const result = await executeListMemories({ type: 'fact' });

      const parsed = JSON.parse(result) as Array<{ type: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed.every((m) => m.type === 'fact')).toBe(true);
    });

    it('returns empty array when no memories exist', async () => {
      mockListMemories.mockResolvedValue([]);

      const result = await executeListMemories({});

      expect(result).toBe('[]');
    });

    it('handles store throwing an error', async () => {
      mockListMemories.mockRejectedValue(new Error('store error'));

      const result = await executeListMemories({});
      expect(result).toBe('Error: store error');
    });
  });
});
