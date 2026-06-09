---
name: harden-bash-tool
description: Bash 工具安全加固 — 破坏性命令检测 + 路径验证
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Bash Tool Timeout & Security Hardening

You are a security specialist. Harden the Bash tool with timeouts, path restrictions, and destructive command confirmation.

## Context

`src/tools/BashTool.ts` executes shell commands. Currently it has timeout support but lacks:
- Destructive command detection (rm, del, format, etc.)
- Working directory validation (must be inside project)
- Command length limits

## Tasks

### 1. Add Destructive Command Detection

In `src/tools/BashTool.ts`, add a denylist check:

```typescript
const DESTRUCTIVE_PATTERNS = [
  /^rm\s+-rf\s+\//,       // rm -rf /
  /^rm\s+--no-preserve-root/,
  /^sudo\s+/,
  /^del\s+\/f\s+\/s/,     // Windows force recursive delete
  /^format\s+/,
  /^mkfs\s+/,
  /^dd\s+/,
  /^:\(\)\s*\{/,          // Fork bomb
  /^>\s*\/dev\/sda/,      // Direct disk write
  /^chmod\s+-R\s+777\s+\//,
];

function isDestructive(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some(p => p.test(command.trim()));
}
```

Add a confirmation flow: if destructive, return a warning instead of executing.

### 2. Add Command Length Limit

```typescript
const MAX_COMMAND_LENGTH = 10_000;

if (command.length > MAX_COMMAND_LENGTH) {
  return `Error: Command too long (${command.length} chars, max ${MAX_COMMAND_LENGTH})`;
}
```

### 3. Verify Working Directory

If `cwd` is provided, verify it's within the project tree:

```typescript
import { resolve } from 'node:path';

if (cwd) {
  const resolved = resolve(cwd);
  const projectRoot = resolve('.');
  if (!resolved.startsWith(projectRoot)) {
    return `Error: Working directory must be within the project: ${resolved}`;
  }
}
```

### 4. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/tools/BashTool.ts` — add destructive command detection, path validation
