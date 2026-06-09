---
name: fix-eslint-any-cleanup
description: 消除 no-explicit-any — 减少 ESLint 错误
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# ESLint no-explicit-any Cleanup

You are a TypeScript strictness specialist. Remove `any` types from the codebase.

## Context

The ESLint config has `@typescript-eslint/no-explicit-any: 'error'`, but running `npm run lint` shows 13 `no-explicit-any` errors and 21 `require-await` warnings. Your job is to fix the `no-explicit-any` errors.

## Tasks

### 1. Find and Fix `any` Types

Run `npm run lint 2>&1` and collect the errors. For each `no-explicit-any` error:

- Replace `any` with `unknown` where possible
- Replace with proper types where the shape is known
- Use `Record<string, unknown>` for dictionary objects
- Use specific union types for limited value sets

### 2. Update `.gitignore` to exclude `.tsbuildinfo`

Add `.tsbuildinfo` to `.gitignore` if not already there.

### 3. Iterate

After each change, run `npm run lint` again to see remaining errors. Fix as many as possible.

### 4. Verify

```bash
npm run lint
npm run check
npm test
```

Target: Reduce `no-explicit-any` from 13 to 0. If any truly can't be fixed (e.g., they're in test files where `any` is needed for mocking), add a `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment with a brief reason.

## Files to Edit
- Various files — depends on lint output
