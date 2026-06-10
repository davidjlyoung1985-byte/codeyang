---
name: s14-ai-cache
description: AI 响应缓存 — 相同输入去重 + 写操作自动失效
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# AI Response Cache

Cache LLM responses for identical inputs to avoid redundant API calls.

## Tasks

### 1. Add cache to `src/agent/Agent.ts`

```typescript
private responseCache = new Map<string, { result: any; timestamp: number }>();
private static CACHE_TTL = 60_000; // 1 minute
private static CACHE_MAX_SIZE = 50;

private getCacheKey(system: string, messages: string, tools: string): string {
  // Hash the last user message + system prompt
  const lastUser = messages.split('"role":"user"').pop()?.slice(0, 500) || '';
  return `${system.length}:${lastUser}:${tools.length}`;
}

private checkCache(key: string): any | null {
  const entry = this.responseCache.get(key);
  if (entry && Date.now() - entry.timestamp < Agent.CACHE_TTL) return entry.result;
  this.responseCache.delete(key);
  return null;
}

private setCache(key: string, result: any): void {
  if (this.responseCache.size >= Agent.CACHE_MAX_SIZE) {
    // Evict oldest
    const oldest = this.responseCache.entries().next().value;
    if (oldest) this.responseCache.delete(oldest[0]);
  }
  this.responseCache.set(key, { result, timestamp: Date.now() });
}
```

### 2. Use in stream call

Before calling LLM, check cache:
```typescript
const cacheKey = this.getCacheKey(systemPrompt, JSON.stringify(messages), JSON.stringify(toolSchemas()));
const cached = this.checkCache(cacheKey);
if (cached) {
  // Use cached result
  return cached;
}
// ... call LLM ...
this.setCache(cacheKey, streamResult);
```

### 3. Clear cache on writes

In the write/edit handler:
```typescript
if (tc.name === 'Write' || tc.name === 'Edit') {
  this.responseCache.clear();
}
```

### 4. Verify
```bash
npm run check && npm test
```
