---
name: refactor-tool-registry
description: 拆分 registry.ts — 1000+ 行工具定义按类别拆分为独立文件
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, delete_file
---
# Refactor: Split Tool Registry

You are a code architecture specialist. Your mission is to split the monolithic `src/tools/registry.ts` (~1000+ lines) into per-category files.

## Context

`src/tools/registry.ts` currently contains:
- All tool definitions (name, description, parameters, execute function) in one array
- MCP tool injection logic
- Qt tool registration
- Tool context management
- Tool schema generation

This is a single-responsibility violation: the file is both a **registry** (which tools exist) and the **definition** (what each tool does).

## Tasks

### 1. Create Category Definition Files

Move inline tool definitions from `registry.ts` into category files in `src/tools/definitions/`:

```
src/tools/definitions/
├── index.ts              # barrel export combining all categories
├── core.def.ts           # Bash, Read, Write, Edit, Glob, Grep, TodoWrite, WebFetch, Task, Question
├── filesystem.def.ts     # Copy, Move, Delete, Mkdir, List, Exists
├── data.def.ts           # JsonParse/Write/Query, YamlParse/Write, Convert, CsvParse/Write, XmlParse/Write
├── git.def.ts            # GitStatus through GitBlame (16 tools)
├── code.def.ts           # ParseAst, AnalyzeCode, Complexity, Lint, FindDeps, CountLines
├── network.def.ts        # HttpRequest, DownloadFile, UploadFile, ApiCall, CheckUrl, ParseUrl
├── memory.def.ts         # Remember, Recall, Forget, ListMemories
├── image.def.ts          # ImageInfo, ImageToBase64, ListImages
├── math.def.ts           # MathSolve, MathPlot, MathExplain
└── search.def.ts         # Search
```

### 2. Each Definition File Format

Each file exports a `definitions` array:

```typescript
import type { ToolDefinition } from '../../types.js';
// import the execute function
import { executeBash } from '../BashTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'Bash',
    description: 'Execute a shell command...',
    parameters: { ... },
    execute: async (args) => executeBash(...),
  },
  // ...
];
```

### 3. Update registry.ts

After extracting definitions:
- Import from `./definitions/index.js`
- Keep: `tools` array (just spread `[...allCategoryDefs]`), `setToolContext`, `setMcpManager`, `getTool`, `toolSchemas`, `refreshMcpTools`, `registerQtTools` in `registry.ts`
- Remove all inline `{ name, description, parameters, execute }` objects

### 4. Verify

```bash
npm run check
npm test
```

All tests must pass. The refactoring should be purely structural — no behavior change.

## Files to Create
- `src/tools/definitions/core.def.ts`
- `src/tools/definitions/filesystem.def.ts`
- `src/tools/definitions/data.def.ts`
- `src/tools/definitions/git.def.ts`
- `src/tools/definitions/code.def.ts`
- `src/tools/definitions/network.def.ts`
- `src/tools/definitions/memory.def.ts`
- `src/tools/definitions/image.def.ts`
- `src/tools/definitions/math.def.ts`
- `src/tools/definitions/search.def.ts`
- `src/tools/definitions/index.ts` (barrel)

## Files to Edit
- `src/tools/registry.ts` — slim down to orchestration only
