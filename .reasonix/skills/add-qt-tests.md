---
name: add-qt-tests
description: 补全 Qt 工具模块测试 — 10 个 Qt 工具各有独立测试文件
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Testing: Qt Tool Module Coverage

You are a testing specialist. Your mission is to add comprehensive tests for the 10 Qt-specific tools.

## Context

The Qt module has 30 tests in `src/qt/index.test.ts` and 25 tests in `src/qt/tools.test.ts`, but the individual tool files in `src/qt/tools/` have NO dedicated test files.

Qt tools (in `src/qt/tools/`):
| File | Tool | Purpose |
|------|------|---------|
| `QtBuildTool.ts` | QtBuild | Analyze build system |
| `QtUiTool.ts` | QtUi | Analyze .ui form files |
| `QtQmlTool.ts` | QtQml | Analyze QML files |
| `QtSignalsTool.ts` | QtSignals | Signal/slot analysis |
| `QtThreadTool.ts` | QtThread | Thread safety analysis |
| `QtChartsTool.ts` | QtCharts | Chart code generation |
| `QtModelViewTool.ts` | QtModelView | Model/view pattern analysis |
| `QtProFileTool.ts` | QtProFile | .pro file editing |
| `QtMigrationTool.ts` | QtMigration | Qt5→Qt6 migration |
| `QtMathTool.ts` | QtMath | Qt math examples |

## Tasks

### 1. Check Existing Coverage

First check what's already tested:
- Read `src/qt/tools.test.ts` — understand the existing test patterns
- Read `src/qt/index.test.ts` — understand the integration test patterns
- Read 2-3 of the tool source files to understand their API

### 2. Write Tests for the Most Critical Tools (at least 4)

Prioritize tools that do the most complex work:

1. **`src/qt/tools/QtMigrationTool.test.ts`** — Most complex, highest value
   - Test migration pattern detection
   - Test replacement generation
   - Test C++ source scanning

2. **`src/qt/tools/QtQmlTool.test.ts`** — Core functionality
   - Test versioned import detection
   - Test type annotation checks
   - Test binding analysis

3. **`src/qt/tools/QtProFileTool.test.ts`** — Config parsing
   - Test .pro file parsing
   - Test editing/suggesting

4. **`src/qt/tools/QtBuildTool.test.ts`** — Build analysis
   - Test build system detection
   - Test CMake/qmake parsing

### 3. Follow This Pattern

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('QtMigrationTool', () => {
  // ... tests
});
```

Use the existing patterns from `src/qt/tools.test.ts` for creating temp files and calling the tool functions.

### 4. Verify

```bash
npm run check
npm test
```

All tests must pass.
