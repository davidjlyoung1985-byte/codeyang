---
name: add-structured-logging
description: 添加结构化日志系统 — debug/info/warn/error 分级
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Structured Logging System

You are a logging specialist. Add structured logging to CodeYang.

## Context

Currently, CodeYang uses `console.log` for everything — user messages, errors, debug output, tool results. There's no way to filter noise from diagnostics.

## Tasks

### 1. Create `src/utils/logger.ts`

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PREFIXES: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

let currentLevel: LogLevel = process.env['CODEX_DEBUG'] ? 'debug' : 'info';

export const logger = {
  setLevel(level: LogLevel) { currentLevel = level; },
  
  debug(...args: unknown[]) {
    if (currentLevel === 'debug') console.log(`[DEBUG]`, ...args);
  },
  
  info(...args: unknown[]) {
    if (currentLevel !== 'error') console.log(...args);
  },
  
  warn(...args: unknown[]) {
    if (currentLevel !== 'error') console.warn(`⚠️`, ...args);
  },
  
  error(...args: unknown[]) {
    console.error(`❌`, ...args);
  },
};
```

### 2. Update `src/agent/Agent.ts`

Replace debug console.log with logger.debug:
- Line with `process.env['CODEX_DEBUG']` check → `logger.debug()`

### 3. Update `src/index.ts`

Replace raw console.log calls with appropriate logger calls:
- `console.log('Fatal error:', err)` → `logger.error(err)`
- Status messages → `logger.info()`

### 4. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/utils/logger.ts`

## Files to Edit
- `src/agent/Agent.ts` — replace debug console.log
- `src/index.ts` — replace key console.log calls
