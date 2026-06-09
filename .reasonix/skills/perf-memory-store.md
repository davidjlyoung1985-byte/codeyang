---
name: perf-memory-store
description: 优化 MemoryStore 和 SessionStore — 索引加速、会话剪枝、缓存策略
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, delete_file
---
# Performance: MemoryStore + SessionStore Optimization

You are a performance optimization specialist. Your mission is to optimize CodeYang's memory and session storage systems.

## Context

The project has two storage systems in `src/utils/`:
- **memoryStore.ts**: Persistent key-value memory across sessions. Current implementation reads ALL files from disk on every search (O(N) disk I/O).
- **sessionStore.ts**: Session persistence with indexed metadata. Current implementation stores full message history with no size limit.

## Tasks

### 1. Optimize MemoryStore (`src/utils/memoryStore.ts`)

**Problem**: `getMemorySummary()`, `listMemories()`, `searchMemories()` all read every `.json` file from disk. On 1000 memories this is 1000+ disk reads.

**Fix**:
- Add an **in-memory LRU cache** that loads all memories on first access, then serves from cache
- Add a **dirty flag** — track `lastLoaded` timestamp vs files' mtimes
- Implement `listMemories()` to use `readdir` once + cache, not read+parse every file
- Make `getMemorySummary()` build from cache instead of re-reading all files

Example approach:
```typescript
// Add at module level
let memoryCache: Memory[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30s cache

async function getCachedMemories(): Promise<Memory[]> {
  if (memoryCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return memoryCache;
  }
  // Reload from disk
  memoryCache = await loadAllMemories();
  cacheTimestamp = Date.now();
  return memoryCache;
}
```

### 2. Optimize SessionStore (`src/utils/sessionStore.ts`)

**Problem**: Sessions grow unboundedly — every tool call's result gets persisted. Index is separate from data which is good, but no pruning.

**Fix**:
- Add **session message pruning**: keep last N messages (e.g. 100), summarize older ones
- Add a `pruneSession()` function that truncates `session.messages` to max N entries
- Call `pruneSession()` in `saveSession()` before writing to disk
- Add a note that the session title is only taken from the FIRST user message (this is already correct)

### 3. Verify

Run `npm run check` and `npm test` to verify nothing is broken.

## Files to Edit
- `src/utils/memoryStore.ts` — add LRU cache layer
- `src/utils/sessionStore.ts` — add message pruning
