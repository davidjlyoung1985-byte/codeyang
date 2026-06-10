---
name: s3-perf-benchmarks
description: 性能基准测试 — MemoryStore + GlobTool + SessionStore 基准
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Performance Benchmarks

Create benchmark tests for critical paths.

## Tasks

### 1. Create `src/utils/memoryStore.bench.ts`
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { saveMemory, listMemories, searchMemories, deleteMemory } from './memoryStore.js';

const TEST_COUNT = 50;

describe('MemoryStore benchmarks', () => {
  const ids: string[] = [];
  
  beforeAll(async () => {
    for (let i = 0; i < TEST_COUNT; i++) {
      const mem = await saveMemory(`bench-key-${i}`, `bench-value-${i}-data-for-testing`, 'fact');
      ids.push(mem.id);
    }
  });
  
  afterAll(async () => {
    for (const id of ids) {
      await deleteMemory(id);
    }
  });
  
  it(`listMemories under 100ms (${TEST_COUNT} memories)`, async () => {
    const start = Date.now();
    const result = await listMemories();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result.length).toBeGreaterThanOrEqual(TEST_COUNT);
  });
  
  it('searchMemories under 30ms', async () => {
    const start = Date.now();
    const result = await searchMemories('bench-value');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30);
    expect(result.length).toBeGreaterThan(0);
  });
});
```

### 2. Create `src/tools/GlobTool.bench.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { executeGlob } from './GlobTool.js';

describe('GlobTool benchmarks', () => {
  it('**/*.ts under 500ms', async () => {
    const start = Date.now();
    const result = await executeGlob('**/*.ts');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(result).toContain('.ts');
  });
  
  it('narrow glob under 100ms', async () => {
    const start = Date.now();
    await executeGlob('package.json');
    expect(Date.now() - start).toBeLessThan(100);
  });
});
```

### 3. Add `package.json` script
```json
"bench": "vitest run src/**/*.bench.ts --reporter=verbose"
```

### 4. Run
```bash
npm run bench
npm run check && npm test
```
