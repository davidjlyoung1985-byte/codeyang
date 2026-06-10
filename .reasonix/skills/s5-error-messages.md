---
name: s5-error-messages
description: 错误信息统一 — 标准化工具错误格式 + 用户友好提示
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Standardized Error Messages

Create a unified error helper and apply it to all tool definition files.

## Tasks

### 1. Create `src/tools/errors.ts`

```typescript
export function toolError(ctx: string, msg: string, hint?: string): string {
  let r = `[${ctx}] ${msg}`;
  if (hint) r += `\n  💡 ${hint}`;
  return r;
}

export function fileNotFound(p: string): string {
  return toolError('FS', `File not found: ${p}`, 'Check the path and try again.');
}
export function invalidParam(k: string, expect: string): string {
  return toolError('Validation', `"${k}" expected ${expect}`, 'Check the parameter value.');
}
export function netError(url: string, d: string): string {
  return toolError('Network', `${url}: ${d}`, 'Check connectivity and URL.');
}
export function gitError(op: string, d: string): string {
  return toolError('Git', `${op}: ${d}`, 'Run GitStatus to check repo state.');
}
export function parseError(fmt: string, d: string): string {
  return toolError('Parse', `${fmt}: ${d}`, 'Validate the input format.');
}
```

### 2. Update definitions

In each `.def.ts` file, replace raw `Error: ...` strings with calls from `errors.ts`. Focus on:
- `src/tools/definitions/core.def.ts` — Read/Write/Edit/Bash
- `src/tools/definitions/network.def.ts` — HttpRequest/CheckUrl
- `src/tools/definitions/filesystem.def.ts` — Copy/Move/Delete

### 3. Verify
```bash
npm run check && npm test
```
