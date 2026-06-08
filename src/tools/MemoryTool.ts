import {
  saveMemory,
  getMemory,
  getMemoryByKey,
  listMemories,
  searchMemories,
  deleteMemory,
  deleteMemoryByKey,
} from '../utils/memoryStore.js';

const MEMORY_TYPES = ['fact', 'preference', 'project', 'instruction', 'context'] as const;

export async function executeRemember(args: Record<string, unknown>): Promise<string> {
  const key = String(args['key'] ?? '').trim();
  const value = String(args['value'] ?? '').trim();
  const type = String(args['type'] ?? 'fact').trim() as (typeof MEMORY_TYPES)[number];

  if (!key || !value) {
    return '{"error":"key and value are required"}';
  }

  const validType = MEMORY_TYPES.includes(type) ? type : 'fact';
  const memory = await saveMemory(key, value, validType);
  return JSON.stringify({ id: memory.id, key: memory.key, type: memory.type });
}

export async function executeRecall(args: Record<string, unknown>): Promise<string> {
  const key = String(args['id'] ?? '').trim();
  const query = String(args['query'] ?? '').trim();

  if (key) {
    const mem = await getMemory(key);
    if (!mem) return '{"error":"memory not found"}';
    return JSON.stringify(mem);
  }

  if (query) {
    const results = await searchMemories(query);
    if (results.length === 0) {
      const byKey = await getMemoryByKey(query);
      if (byKey) return JSON.stringify(byKey);
    }
    return JSON.stringify(results);
  }

  const all = await listMemories();
  return JSON.stringify(all);
}

export async function executeForget(args: Record<string, unknown>): Promise<string> {
  const key = String(args['key'] ?? args['id'] ?? '').trim();
  if (!key) return '{"error":"key or id is required"}';

  // Try as id first, then as key
  const byId = await deleteMemory(key);
  if (byId) return JSON.stringify({ deleted: true, id: key });

  const byKey = await deleteMemoryByKey(key);
  return JSON.stringify({ deleted: byKey, key });
}

export async function executeListMemories(args: Record<string, unknown>): Promise<string> {
  const type = String(args['type'] ?? '').trim();
  const all = await listMemories();
  const filtered = type ? all.filter((m) => m.type === type) : all;
  return JSON.stringify(filtered);
}
