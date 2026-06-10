---
name: improve-error-messages
description: 改进错误信息 — 所有工具错误归一化为用户友好的格式
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Error Message Improvement

You are a UX/DX specialist. Improve all tool error messages to be user-friendly and actionable.

## Context

Tools return inconsistent error messages. Some return `Error: ...`, some return raw stack traces, others return empty strings. Every error should tell the user WHAT went wrong and WHAT to do about it.

## Tasks

### 1. Create `src/tools/errors.ts`

```typescript
/**
 * Standardized error helper for all tools.
 * Produces consistent, user-friendly error messages.
 */
export function toolError(context: string, message: string, hint?: string): string {
  let result = `[${context}] ${message}`;
  if (hint) result += `\n  💡 ${hint}`;
  return result;
}

export function fileNotFound(filePath: string): string {
  return toolError('FileSystem', `File not found: ${filePath}`, 'Check the path exists and is readable.');
}

export function invalidParam(param: string, expected: string): string {
  return toolError('Validation', `Invalid "${param}": expected ${expected}`, 'Check the parameter value and type.');
}

export function networkError(url: string, detail: string): string {
  return toolError('Network', `Request to ${url} failed: ${detail}`, 'Check your network connection and the URL.');
}

export function gitError(operation: string, detail: string): string {
  return toolError('Git', `Git ${operation} failed: ${detail}`, 'Run GitStatus to check repository state.');
}

export function parseError(format: string, detail: string): string {
  return toolError('Parse', `Failed to parse ${format}: ${detail}`, 'Validate the input format and try again.');
}
```

### 2. Update Tool Definitions

Update at least 3 critical definition files to use the new error helpers:

- `src/tools/definitions/core.def.ts` — Bash, Read, Write, Edit
- `src/tools/definitions/network.def.ts` — HttpRequest, CheckUrl
- `src/tools/definitions/filesystem.def.ts` — Copy, Move, Delete

For example, in `core.def.ts`:
```typescript
// Before
return `Error: File does not exist: ${filePath}`;

// After  
import { fileNotFound } from '../errors.js';
return fileNotFound(filePath);
```

### 3. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/tools/errors.ts`

## Files to Edit
- `src/tools/definitions/core.def.ts`
- `src/tools/definitions/network.def.ts`
- `src/tools/definitions/filesystem.def.ts`
