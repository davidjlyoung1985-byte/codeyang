---
name: fix-broken-tests
description: 修复 9 个预存测试失败 — TaskTool + registry 测试
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Fix Pre-existing Test Failures

You are a test repair specialist. Your mission is to fix the pre-existing failing tests in CodeYang.

## Context

There are **9 pre-existing test failures** that were present before any improvements:

1. **`src/tools/TaskTool.test.ts`** — 6 tests fail
2. **`src/tools/registry.test.ts`** — 3 tests fail
3. **`src/agent/Agent.test.ts`** — 2 tests (fixed in previous pass)

## Tasks

### 1. Diagnose and Fix `TaskTool.test.ts` (6 failures)

Read the test file and the source file, then fix:

```bash
npx vitest run src/tools/TaskTool.test.ts
```

Common issues to check:
- The LLMClient mock may need `getTokenUsage()` method
- `registerMathTools` might be missing from registry.ts exports
- Mock setup may need updating after Agent.ts changes

### 2. Diagnose and Fix `registry.test.ts` (3 failures)

```bash
npx vitest run src/tools/registry.test.ts
```

Check if `registerMathTools` export exists in `src/tools/registry.ts`.

### 3. Repair Approach

For each failing test:
1. Read the test to understand what it expects
2. Read the source to see what's actually happening
3. Fix the **source** (not the test) unless the test has wrong expectations
4. If the test needs updating to match correct behavior, update the test

### 4. Verify

```bash
npm test
```

All tests must pass. If some can't be fixed (e.g., they test features that don't exist), mark them as `.skip` with a comment explaining why.

## Files to Edit
- `src/tools/TaskTool.ts` — fix missing methods
- `src/tools/registry.ts` — add missing exports
- `src/tools/TaskTool.test.ts` — fix mocks if needed
- `src/tools/registry.test.ts` — fix expectations if needed
