---
name: s8-node-version-check
description: Node 版本检查 — 启动时验证 >= 18 + 测试
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Node.js Version Check

Add runtime version check at startup.

## Tasks

### 1. Create `src/utils/nodeVersionCheck.ts`

```typescript
const MIN = 18;

export function checkNodeVersion(): void {
  const major = Number(process.versions.node.split('.')[0]) || 0;
  if (major < MIN) {
    console.error(`\n  ❌ Node.js v${process.versions.node} is not supported.`);
    console.error(`  📋 CodeYang requires Node.js >= ${MIN}.0.0`);
    console.error(`  🔄 Upgrade: https://nodejs.org/en/download/\n`);
    process.exit(1);
  }
  if (process.env['CODEX_DEBUG']) {
    console.log(`[Node] v${process.versions.node} (ok)`);
  }
}
```

### 2. Create `src/utils/nodeVersionCheck.test.ts`

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('checkNodeVersion', () => {
  afterEach(() => vi.restoreAllMocks());
  
  it('passes on Node >= 18', async () => {
    const { checkNodeVersion } = await import('./nodeVersionCheck.js');
    expect(() => checkNodeVersion()).not.toThrow();
  });
  
  it('exits on Node < 18', async () => {
    vi.spyOn(process.versions, 'node', 'get').mockReturnValue('12.0.0');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const { checkNodeVersion } = await import('./nodeVersionCheck.js');
    checkNodeVersion();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
```

### 3. Integrate into `src/index.ts`
At the top of `main()`:
```typescript
import { checkNodeVersion } from './utils/nodeVersionCheck.js';
// inside main, first line:
checkNodeVersion();
```

### 4. Verify
```bash
npm run check && npm test
```
