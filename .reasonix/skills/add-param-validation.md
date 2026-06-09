---
name: add-param-validation
description: 添加工具参数校验层 — requiredString/optionalNumber 等
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Tool Parameter Validation Layer

You are a defensive programming specialist. Add input validation to all tool execute functions.

## Context

Most tools in `src/tools/definitions/*.def.ts` do:
```typescript
const filePath = String(args['filePath'] ?? '');
```
This silently converts `null`/`undefined` to empty strings, which then produce confusing errors downstream.

## Tasks

### 1. Create `src/tools/validate.ts`

Create a validation utility with these functions:

```typescript
/** Require a string parameter, throw on missing/empty */
export function requiredString(args: Record<string, unknown>, key: string, label?: string): string {
  const val = args[key];
  if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
    throw new Error(`Missing required parameter: ${label || key}`);
  }
  return String(val);
}

/** Optional string parameter */
export function optionalString(args: Record<string, unknown>, key: string, defaultVal?: string): string | undefined {
  const val = args[key];
  if (val === undefined || val === null) return defaultVal;
  return String(val);
}

/** Optional number parameter */
export function optionalNumber(args: Record<string, unknown>, key: string, defaultVal?: number): number | undefined {
  const val = args[key];
  if (val === undefined || val === null) return defaultVal;
  const n = Number(val);
  if (isNaN(n)) throw new Error(`Invalid number for parameter: ${key}`);
  return n;
}

/** Optional boolean parameter */
export function optionalBoolean(args: Record<string, unknown>, key: string, defaultVal?: boolean): boolean | undefined {
  const val = args[key];
  if (val === undefined || val === null) return defaultVal;
  return val === true || val === 'true';
}
```

### 2. Update Core Tool Definitions

Update the execute functions in at least these critical files to use validation:

- `src/tools/definitions/core.def.ts` — Bash, Read, Write, Edit
- `src/tools/definitions/network.def.ts` — HttpRequest
- `src/tools/definitions/filesystem.def.ts` — Copy, Move

Replace patterns like:
```typescript
const filePath = String(args['filePath'] ?? '');
```
With:
```typescript
const filePath = requiredString(args, 'filePath');
```

### 3. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/tools/validate.ts`

## Files to Edit
- `src/tools/definitions/core.def.ts`
- `src/tools/definitions/network.def.ts`
- `src/tools/definitions/filesystem.def.ts`
