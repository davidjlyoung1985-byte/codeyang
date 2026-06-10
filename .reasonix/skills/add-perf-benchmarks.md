---
name: add-perf-benchmarks
description: 性能基准测试 — 为关键路径添加 benchmark 测试
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Performance Benchmarks

You are a performance specialist. Add benchmark tests for critical code paths.

## Context

The project has 467 functional tests but NO performance benchmarks. Key paths like `MemoryStore`, `SessionStore`, `GlobTool`, and `CodeAnalysisTool` should have baseline performance metrics to detect regressions.

## Tasks

### 1. Create `src/utils/memoryStore.bench.ts`

Benchmark memory store operations:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { saveMemory, searchMemories, listMemories } from './memoryStore.js';

describe('MemoryStore benchmarks', () => {
  beforeAll(async () => {
    // Create 100 test memories
    for (let i = 0; i < 100; i++) {
      await saveMemory(`key-${i}`, `value-${i}-test-data-for-benchmark`, 'fact');
    }
  });

  it('listMemories under 50ms', async () => {
    const start = Date.now();
    const result = await listMemories();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(result.length).toBeGreaterThanOrEqual(100);
  });

  it('searchMemories under 20ms', async () => {
    const start = Date.now();
    const result = await searchMemories('benchmark');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(20);
  });
});
```

### 2. Create `src/tools/GlobTool.bench.ts`

Benchmark glob operations:
```typescript
import { describe, it, expect } from 'vitest';
import { executeGlob } from './GlobTool.js';

describe('GlobTool benchmarks', () => {
  it('**/*.ts across project under 500ms', async () => {
    const start = Date.now();
    const result = await executeGlob('**/*.ts');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(result).toContain('.ts');
  });
});
```

### 3. Add benchmark script in `package.json`

```json
"bench": "vitest run --reporter=verbose src/**/*.bench.ts"
```

### 4. Run and verify

```bash
npm run bench
```

### 5. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/utils/memoryStore.bench.ts`
- `src/tools/GlobTool.bench.ts`

## Files to Edit
- `package.json` — add bench script
