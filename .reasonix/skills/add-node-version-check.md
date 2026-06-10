---
name: add-node-version-check
description: Node 版本检查 — 启动时验证 Node >= 18
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Node.js Version Check

You are a compatibility specialist. Add a runtime Node.js version check at startup.

## Context

`package.json` specifies `"node": ">=18"` but there's no runtime check. Users on Node 16 get cryptic errors from ESM imports and missing APIs.

## Tasks

### 1. Create `src/utils/nodeVersionCheck.ts`

```typescript
const MIN_MAJOR = 18;
const MIN_MINOR = 0;

/**
 * Check Node.js version at runtime. Exits with a clear error if version is too old.
 * Call at the very beginning of the entry point.
 */
export function checkNodeVersion(): void {
  const parts = process.versions.node.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  
  if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
    console.error('');
    console.error(`  ❌  Node.js v${process.versions.node} is not supported.`);
    console.error(`  📋  CodeYang requires Node.js >= ${MIN_MAJOR}.${MIN_MINOR}.0`);
    console.error(`  🔄  Upgrade: https://nodejs.org/en/download/`);
    console.error('');
    process.exit(1);
  }
  
  // Debug: show version when CODEX_DEBUG is set
  if (process.env['CODEX_DEBUG']) {
    console.log(`[Node] v${process.versions.node} (ok)`);
  }
}
```

### 2. Integrate into `src/index.ts`

Add at the top of `main()`, before any other logic:

```typescript
import { checkNodeVersion } from './utils/nodeVersionCheck.js';

async function main() {
  checkNodeVersion();
  // ... rest of main
}
```

### 3. Add Unit Test

Create `src/utils/nodeVersionCheck.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('checkNodeVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes on current Node version', () => {
    const { checkNodeVersion } = await import('./nodeVersionCheck.js');
    expect(() => checkNodeVersion()).not.toThrow();
  });

  it('fails on Node 12', () => {
    vi.spyOn(process.versions, 'node', 'get').mockReturnValue('12.0.0');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const { checkNodeVersion } = await import('./nodeVersionCheck.js');
    checkNodeVersion();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
```

### 4. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/utils/nodeVersionCheck.ts`
- `src/utils/nodeVersionCheck.test.ts`

## Files to Edit
- `src/index.ts` — add version check call
