---
name: add-barrel-exports
description: 为 src/ 各模块添加 barrel 导出文件 (index.ts)
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Add barrel exports for all src/ modules

You are a module architecture specialist. Add proper barrel exports (index.ts) for every module directory.

## Context

Currently `src/` has these module directories but NO barrel export:
- `src/tools/` — Has index.test.ts but NO index.ts barrel
- `src/utils/` — No barrel export
- `src/mcp/` — No barrel export

Only `src/qt/` and `src/math/` have proper barrel exports. Without barrels, consumers must import from deep paths like `'../utils/memoryStore.js'` instead of `'../utils/index.js'`.

## Tasks

### 1. Create `src/utils/index.ts`

Export all public functions:
```typescript
export { saveMemory, getMemory, getMemoryByKey, listMemories, searchMemories, deleteMemory, deleteMemoryByKey, getMemorySummary } from './memoryStore.js';
export { saveSession, loadSession, listSessions, deleteSession } from './sessionStore.js';
export { logger } from './logger.js';
```

### 2. Create `src/mcp/index.ts`

Export all public types and classes:
```typescript
export { McpManager } from './McpManager.js';
export { McpClient, type McpToolDef } from './McpClient.js';
export type { McpServerConfig } from './types.js';
export { MCP_TOOL_PREFIX, MCP_TOOL_SEPARATOR, MCP_QUALIFIED_PREFIX, validateMcpConfig } from './types.js';
```

### 3. Create `src/tools/index.ts`

Export the registry and validation:
```typescript
export { tools, getTool, toolSchemas, setToolContext, getCurrentContext, setMcpManager, refreshMcpTools, registerQtTools, registerMathTools, type ToolContext } from './registry.js';
export { requiredString, optionalString, optionalNumber, optionalBoolean } from './validate.js';
```

### 4. Update `src/index.ts` imports

Update the CLI entry point to use barrel imports where cleaner:
- `import { setMcpManager, refreshMcpTools, registerQtTools, toolSchemas } from './tools/index.js'` (or keep as-is from registry.js — min diff)

### 5. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/utils/index.ts`
- `src/mcp/index.ts`
- `src/tools/index.ts`

## Files to Edit
- `src/index.ts` — optional, only if it simplifies imports
