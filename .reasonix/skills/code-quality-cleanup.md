---
name: code-quality-cleanup
description: 代码质量提升 — 类型安全强化、长函数拆分、未使用变量清理
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, get_symbols
---
# Code Quality: Type Safety & Refactoring

You are a code quality specialist. Your mission is to improve CodeYang's code quality — fix type issues, split long functions, clean up dead code.

## Tasks

### 1. Fix `any` Types in Agent.ts

**Problem**: `src/agent/Agent.ts` uses `Record<string, unknown>` but has implicit `any` in several places via `JSON.parse(JSON.stringify(obj))` patterns and the `jsonClone` method.

**Fix**:
- Add proper type annotation on `jsonClone<T>(obj: T): T` (it already has this — verify it's used consistently)
- Check `toolCallsAccum` map — ensure all value accesses are typed
- The `assistantContent` array uses inline type literals repeated — extract a type alias:
  ```typescript
  type AssistantContentBlock = 
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown };
  ```

### 2. Review `src/tools/registry.ts` for Dead Code

**Problem**: The registry is ~1000+ lines with inline tool definitions. Some tools may have handlers that became dead code.

**Check**:
- Verify `executeSearch`, `executeImageInfo`, `executeImageToBase64`, `executeListImages` all have corresponding implementations in their tool files
- Check that `src/tools/MemoryTool.ts` exports match what `registry.ts` imports

### 3. Improve Error Handling Consistency

**Problem**: Some tools return `Error: ...` text on failure, others throw exceptions, others return structured errors. Inconsistent.

**Fix**: Ensure all `execute*` functions in tool files follow this pattern:
```typescript
try {
  // ... logic
  return 'success message';
} catch (err) {
  return `Error: ${err instanceof Error ? err.message : String(err)}`;
}
```

Check at least: `src/tools/GlobTool.ts`, `src/tools/MemoryTool.ts`, `src/tools/DataTool.ts` for consistency.

### 4. Remove unused file if found

Check if `src/utils/globMatch.ts` is actually imported anywhere. If not, check if it should be removed or if it's used by GlobTool.

### 5. Verify

Run `npm run check` and `npm test`. All must pass.

## Files to Edit
- `src/agent/Agent.ts` — type aliases, consistency improvements
- `src/tools/registry.ts` — verify imports/results
- Other files based on findings
