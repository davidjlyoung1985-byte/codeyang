---
name: add-memory-search-index
description: MemoryStore 全文搜索索引 — token 倒排索引加速
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Memory Store Full-Text Search Index

You are a search/storage specialist. Add a full-text search index to the MemoryStore.

## Context

`src/utils/memoryStore.ts` currently searches memories by doing O(N) substring matching on every query:
```typescript
return all.filter((m) => m.key.includes(q) || m.value.toLowerCase().includes(q) || m.type.includes(q));
```

## Tasks

### 1. Add In-Memory Search Index in `src/utils/memoryStore.ts`

Add an inverted index that tokenizes memory keys and values:

```typescript
interface SearchIndex {
  /** token → set of memory IDs */
  tokenMap: Map<string, Set<string>>;
  dirty: boolean;
}

let searchIndex: SearchIndex = { tokenMap: new Map(), dirty: false };

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function rebuildIndex(memories: Memory[]): void {
  searchIndex = { tokenMap: new Map(), dirty: false };
  for (const m of memories) {
    const tokens = new Set([
      ...tokenize(m.key),
      ...tokenize(m.value),
      m.type,
    ]);
    for (const token of tokens) {
      if (!searchIndex.tokenMap.has(token)) {
        searchIndex.tokenMap.set(token, new Set());
      }
      searchIndex.tokenMap.get(token)!.add(m.id);
    }
  }
}

function searchIndexed(query: string, allMemories: Map<string, Memory>): Memory[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  
  // Find memories matching ALL tokens
  let results: Set<string> | null = null;
  for (const token of tokens) {
    const matching = searchIndex.tokenMap.get(token);
    if (!matching) return []; // Token not found → no results
    if (results === null) {
      results = new Set(matching);
    } else {
      results = new Set([...results].filter(id => matching.has(id)));
    }
  }
  
  return results ? [...results].map(id => allMemories.get(id)!).filter(Boolean) : [];
}
```

### 2. Integrate with Cache System

- Call `rebuildIndex()` in `getCachedMemories()` after loading from disk
- Mark index dirty when cache is invalidated
- Use the index in `searchMemories()` when available, fall back to substring if index not built

### 3. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/utils/memoryStore.ts` — add SearchIndex, integrate with cache
