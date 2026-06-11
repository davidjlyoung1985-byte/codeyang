import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';

const MEMORY_DIR = join(homedir(), '.codeyang', 'memory');

// ── In-memory cache layer ────────────────────────────────────────────────
// Avoids re-reading & re-parsing every .json file on every access.
// Invalidated on write (save/delete) and periodically refreshed via TTL.
let memoryCache: Memory[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30-second cache TTL
const MAX_CACHE_ENTRIES = 500; // Prevent unbounded memory growth

// ── Full-text search index ───────────────────────────────────────────────
// Token-based inverted index built from cached memories. Rebuilt on cache
// refresh; marked dirty on invalidation so it is rebuilt lazily on next search.
interface SearchIndex {
  /** token → set of memory IDs */
  tokenMap: Map<string, Set<string>>;
  dirty: boolean;
}

let searchIndex: SearchIndex = { tokenMap: new Map(), dirty: false };
const MAX_TOKEN_MAP_ENTRIES = 20_000;

/** Lowercase tokeniser — splits on non-[a-z0-9\u4e00-\u9fff-] characters. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Rebuild the inverted index from all cached memories. */
function rebuildIndex(memories: Memory[]): void {
  const tokenMap = new Map<string, Set<string>>();
  for (const m of memories) {
    const tokens = new Set([...tokenize(m.key), ...tokenize(m.value), m.type]);
    for (const token of tokens) {
      if (!tokenMap.has(token)) {
        tokenMap.set(token, new Set());
      }
      tokenMap.get(token)!.add(m.id);
    }
  }
  // Limit index size to prevent unbounded growth
  const entries = tokenMap.entries();
  if (tokenMap.size > MAX_TOKEN_MAP_ENTRIES) {
    const i = entries.next();
    // keep first MAX_TOKEN_MAP_ENTRIES tokens (least significant ones may be dropped)
    const dropped = tokenMap.size - MAX_TOKEN_MAP_ENTRIES;
    for (let d = 0; d < dropped; d++) {
      const val = entries.next();
      if (!val.done) tokenMap.delete(val.value[0]);
    }
  }
  searchIndex = { tokenMap, dirty: false };
}

/** Search using the inverted index (AND query — all tokens must match). */
function searchIndexed(query: string, allMemories: Map<string, Memory>): Memory[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // Intersect result sets for each token (AND query)
  const allTokenSets: Set<string>[] = [];
  for (const token of tokens) {
    const matching = searchIndex.tokenMap.get(token);
    if (!matching) return []; // Any token missing → no results
    allTokenSets.push(matching);
  }

  // Start with the first token's set, intersect with the rest
  let resultSet = allTokenSets[0];
  for (let i = 1; i < allTokenSets.length; i++) {
    const next = allTokenSets[i];
    resultSet = new Set([...resultSet].filter((id) => next.has(id)));
  }

  return [...resultSet].map((id) => allMemories.get(id)).filter((m): m is Memory => m !== undefined);
}

export interface Memory {
  id: string;
  key: string;
  value: string;
  type: 'fact' | 'preference' | 'project' | 'instruction' | 'context';
  createdAt: string;
  updatedAt: string;
}

async function ensureDir() {
  await mkdir(MEMORY_DIR, { recursive: true });
}

function sanitizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 100);
}

/** Invalidate the in-memory cache (called on every write). */
function invalidateCache() {
  memoryCache = null;
  cacheTimestamp = 0;
  searchIndex.dirty = true;
}

/**
 * Return cached memories if fresh; otherwise reload from disk.
 * This replaces repeated readdir + N×readFile calls with a single bulk load.
 */
async function getCachedMemories(): Promise<Memory[]> {
  if (memoryCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return memoryCache;
  }
  // Cache miss or expired — reload everything
  await ensureDir();
  const files = (await readdir(MEMORY_DIR)).filter((f) => f.endsWith('.json'));
  const memories: Memory[] = [];
  for (const f of files) {
    try {
      memories.push(JSON.parse(await readFile(join(MEMORY_DIR, f), 'utf-8')));
    } catch {
      // Skip corrupt files
    }
  }
  memoryCache = memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  cacheTimestamp = Date.now();

  // Evict oldest entries if over limit to prevent unbounded memory growth
  if (memoryCache.length > MAX_CACHE_ENTRIES) {
    memoryCache = memoryCache.slice(0, MAX_CACHE_ENTRIES);
  }

  // Rebuild search index alongside the cache
  if (searchIndex.dirty || searchIndex.tokenMap.size === 0) {
    rebuildIndex(memoryCache);
  }

  return memoryCache;
}

export async function saveMemory(
  key: string,
  value: string,
  type: Memory['type'] = 'fact',
  existingId?: string,
): Promise<Memory> {
  await ensureDir();
  const now = new Date().toISOString();
  const id = existingId ?? `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const skey = sanitizeKey(key);

  // Check if key already exists to preserve createdAt
  let createdAt = now;
  if (!existingId) {
    const existing = await getMemoryByKey(skey);
    if (existing) {
      createdAt = existing.createdAt;
      return saveMemory(key, value, type, existing.id);
    }
  } else {
    try {
      const data = JSON.parse(await readFile(join(MEMORY_DIR, `${id}.json`), 'utf-8')) as Memory;
      createdAt = data.createdAt;
    } catch {}
  }

  const memory: Memory = { id, key: skey, value, type, createdAt, updatedAt: now };
  await writeFile(join(MEMORY_DIR, `${id}.json`), JSON.stringify(memory, null, 2));

  // Invalidate cache so next read picks up the change
  invalidateCache();

  return memory;
}

export async function getMemory(id: string): Promise<Memory | null> {
  try {
    return JSON.parse(await readFile(join(MEMORY_DIR, `${id}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

export async function getMemoryByKey(key: string): Promise<Memory | null> {
  const skey = sanitizeKey(key);
  const all = await getCachedMemories();
  return all.find((m) => m.key === skey) ?? null;
}

export async function listMemories(): Promise<Memory[]> {
  return getCachedMemories();
}

export async function searchMemories(query: string): Promise<Memory[]> {
  const all = await getCachedMemories();

  // Full-text search via inverted index (AND over tokens)
  if (!searchIndex.dirty && searchIndex.tokenMap.size > 0) {
    const allMap = new Map<string, Memory>();
    for (const m of all) allMap.set(m.id, m);
    const indexed = searchIndexed(query, allMap);
    if (indexed.length > 0) return indexed;
    // Fall through to substring search if index returned nothing
    // (the query might be a sub-string that tokenization doesn't cover)
  }

  // Fallback: substring matching
  const q = query.toLowerCase();
  return all.filter((m) => m.key.includes(q) || m.value.toLowerCase().includes(q) || m.type.includes(q));
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    await unlink(join(MEMORY_DIR, `${id}.json`));
    invalidateCache();
    return true;
  } catch {
    return false;
  }
}

export async function deleteMemoryByKey(key: string): Promise<boolean> {
  const mem = await getMemoryByKey(key);
  if (!mem) return false;
  return deleteMemory(mem.id);
}

export async function getMemorySummary(): Promise<string> {
  const all = await getCachedMemories();
  if (all.length === 0) return '';

  const facts = all.filter((m) => m.type === 'fact');
  const prefs = all.filter((m) => m.type === 'preference');
  const projs = all.filter((m) => m.type === 'project');
  const instrs = all.filter((m) => m.type === 'instruction');
  const ctxs = all.filter((m) => m.type === 'context');

  const lines: string[] = ['<memories>'];
  if (facts.length > 0) {
    lines.push('  <facts>');
    for (const m of facts) lines.push(`    - ${m.key}: ${m.value}`);
    lines.push('  </facts>');
  }
  if (prefs.length > 0) {
    lines.push('  <preferences>');
    for (const m of prefs) lines.push(`    - ${m.key}: ${m.value}`);
    lines.push('  </preferences>');
  }
  if (projs.length > 0) {
    lines.push('  <projects>');
    for (const m of projs) lines.push(`    - ${m.key}: ${m.value}`);
    lines.push('  </projects>');
  }
  if (instrs.length > 0) {
    lines.push('  <instructions>');
    for (const m of instrs) lines.push(`    - ${m.key}: ${m.value}`);
    lines.push('  </instructions>');
  }
  if (ctxs.length > 0) {
    lines.push('  <context>');
    for (const m of ctxs) lines.push(`    - ${m.key}: ${m.value}`);
    lines.push('  </context>');
  }
  lines.push('</memories>');
  return lines.join('\n');
}
