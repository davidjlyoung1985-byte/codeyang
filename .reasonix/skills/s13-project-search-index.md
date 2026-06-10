---
name: s13-project-search-index
description: 项目搜索索引 — 预缓存文件路径加速 Search 工具
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Project Search Index

Add a pre-built file path cache to accelerate the Search tool.

## Tasks

### 1. Create `src/utils/projectIndex.ts`

```typescript
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

interface ProjectIndex {
  files: string[];
  lastBuilt: number;
}

let index: ProjectIndex | null = null;
const REBUILD_INTERVAL_MS = 60_000;
const EXCLUDE = new Set(['node_modules', '.git', 'dist', '.cache', 'build', 'target', '__pycache__', '.venv']);

async function walkDir(dir: string, base: string): Promise<string[]> {
  const entries: string[] = [];
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (EXCLUDE.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        entries.push(...await walkDir(full, base));
      } else {
        entries.push(relative(base, full));
      }
    }
  } catch {}
  return entries;
}

export async function getProjectIndex(root?: string): Promise<ProjectIndex> {
  const projectRoot = root || process.cwd();
  if (index && Date.now() - index.lastBuilt < REBUILD_INTERVAL_MS) {
    return index;
  }
  const files = await walkDir(projectRoot, projectRoot);
  index = { files, lastBuilt: Date.now() };
  return index;
}

export function invalidateIndex(): void {
  index = null;
}
```

### 2. Integrate into `src/tools/SearchTool.ts`

In the search handler, use the index for file name matching:
```typescript
import { getProjectIndex } from '../utils/projectIndex.js';

async function searchByIndex(query: string): Promise<string[]> {
  const idx = await getProjectIndex();
  const q = query.toLowerCase();
  return idx.files.filter(f => f.toLowerCase().includes(q));
}
```

### 3. Verify
```bash
npm run check && npm test
```
