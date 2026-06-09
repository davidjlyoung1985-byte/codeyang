---
name: test-coverage-boost
description: 补全测试覆盖 — MemoryTool、ImageTool、GlobTool、入口文件测试
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Testing: Coverage Booster

You are a testing specialist. Your mission is to increase test coverage for CodeYang's core modules.

## Context

The project has 290 tests across 16 test files. Several tools lack tests entirely. Use `vitest` v4.1.7 (already configured).

## Current coverage gaps (check each before writing):

1. **MemoryTool** (`src/tools/MemoryTool.ts`) — **NO tests**
   - Functions: executeRemember, executeRecall, executeForget, executeListMemories
   - All depend on memoryStore.ts — mock the store functions

2. **GlobTool** (`src/tools/GlobTool.ts`) — **NO tests**
   - Function: executeGlob(pattern, root?)
   - Test: match by pattern, match with root, no matches, invalid pattern

3. **ImageTool** (`src/tools/ImageTool.ts`) — Has tests at `ImageTool.test.ts` (10 tests), review if they cover executeListImages

4. **WebFetchTool** (`src/tools/WebFetchTool.ts`) — **NO tests**
   - Function: executeWebFetch(url, format?)
   - Mock axios to avoid real network calls

5. **WriteTool / ReadTool / EditTool** — Partially covered by `tools.test.ts` and `FileSystemTool.test.ts`, check actual coverage

## Task

Write tests for the **2 most important uncovered modules**: MemoryTool and GlobTool. If WebFetchTool also lacks coverage, add it.

### MemoryTool test requirements (`src/tools/MemoryTool.test.ts`):
- Mock `src/utils/memoryStore.ts` module
- Test `executeRemember` saves with key, value, type
- Test `executeRecall` retrieves by id and by query
- Test `executeForget` deletes by key
- Test `executeListMemories` lists all and filtered by type
- Test error handling (store throws)

### GlobTool test requirements (`src/tools/GlobTool.test.ts`):
- Create temp directory with test files for each test
- Test basic pattern matching (`*.ts`, `**/*.ts`)
- Test with custom root directory
- Test no matches returns empty output
- Test invalid patterns return error

### Follow this pattern from existing tests:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

## Verification
Run `npm test` — all tests must pass. Run `npm run check` — type check must pass.
