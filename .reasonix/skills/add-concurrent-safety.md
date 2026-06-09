---
name: add-concurrent-safety
description: 增加并发安全 — Agent 输入锁、工具互斥、原子操作保护
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Concurrency: Thread Safety & Input Guards

You are a concurrency/race-condition specialist. Your mission is to identify and fix concurrent-access issues in CodeYang.

## Context

CodeYang is a single-threaded Node.js app (async/await), but it has several race-condition risks due to shared mutable state across async operations.

## Tasks

### 1. Input Race Condition in `src/index.ts`

**Problem**: The `handleInput` function checks `if (running) return;` then sets `running = true`. But `handleInput` is async and the `readline` `'line'` event can fire before await returns. Also, `SIGINT` can fire mid-handling.

**Fix**: There's already a `running` guard. But verify:
- Is `running` checked BEFORE `running = true`? (yes) 
- Is `running` reset in the finally block of the try/catch? Check `handleInput` — it sets `running = true` and then `running = false` at the end. But if an exception occurs, `running` stays stuck at `true`.

**Fix**: Wrap the body of `handleInput` in try/finally:
```typescript
async function handleInput(line: string) {
  if (running) return;
  running = true;
  try {
    // ... existing code ...
  } finally {
    running = false;
  }
}
```

### 2. Concurrent Tool Execution — Mutable Shared State

**Problem**: `Agent.run()` runs tools in parallel via `Promise.all`. The `toolResults` array is shared — parallel tools write to it concurrently.

**Fix**: Already partially handled (each tool writes to its own `toolResults[i]` slot). But check `toolCache` access in concurrent tools — if two Read calls happen simultaneously on the same file, both miss cache and both read the file. Add a **pending reads** map:

```typescript
private pendingReads = new Map<string, Promise<string>>();
```

### 3. SIGINT Atomicity

**Problem**: In `src/index.ts`, the `sigintHandler` checks `if (sigintCount > 1) process.exit(1)`. Between `sigintCount++` and the check, another signal can arrive.

**Fix**: The current approach is good enough for Node.js (single-threaded). But verify that `mcpMgr.shutdown()` is awaited before `process.exit()`.

### 4. Tool Cache Atomicity

**Problem**: `invalidateCache()` is called from multiple concurrent paths. `Map` operations in JS are atomic (single-threaded), but verify the check-then-set pattern doesn't have a race:
```typescript
if (cacheable) {
  const key = this.cacheKey(tc.name, tc.input);
  const cached = this.toolCache.get(key);  // Race window
  if (cached && Date.now() - cached.timestamp < Agent.CACHE_TTL_MS) {
    ...
  }
}
```

**Fix**: This is OK for a best-effort cache. Document that concurrent reads may result in redundant file reads (not a correctness issue, just a minor perf one). No fix needed — just note it.

### 5. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/index.ts` — add try/finally to handleInput for running flag
- `src/agent/Agent.ts` — add pendingReads map for concurrent Read deduplication
