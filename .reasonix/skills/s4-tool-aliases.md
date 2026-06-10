---
name: s4-tool-aliases
description: 工具别名系统 — 短命令名 + 模糊搜索 + getTool 集成
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Tool Aliases & Fuzzy Search

Add alias resolution and fuzzy matching for tool names.

## Tasks

### 1. Create `src/tools/aliases.ts`

```typescript
export const TOOL_ALIASES: Record<string, string> = {
  'ls': 'List', 'dir': 'List', 'cp': 'Copy', 'mv': 'Move',
  'rm': 'Delete', 'del': 'Delete', 'mkdir': 'Mkdir', 'md': 'Mkdir',
  'cat': 'Read', 'sh': 'Bash', 'shell': 'Bash',
  'find': 'Search', 'grep': 'Grep',
  'json': 'JsonParse', 'yaml': 'YamlParse', 'csv': 'CsvParse', 'xml': 'XmlParse',
  'fetch': 'WebFetch', 'http': 'HttpRequest',
  'dl': 'DownloadFile', 'ul': 'UploadFile',
  'stats': 'TodoWrite', 'todo': 'TodoWrite',
  'ask': 'Question', 'help': 'Question',
  'st': 'GitStatus', 'br': 'GitBranch', 'co': 'GitCheckout',
  'ci': 'GitCommit', 'di': 'GitDiff', 'lg': 'GitLog',
  'ps': 'GitPush', 'pl': 'GitPull',
};

export function resolveAlias(name: string): string | undefined {
  return TOOL_ALIASES[name.toLowerCase()];
}

export function fuzzyFindTools(query: string, names: string[]): string[] {
  const q = query.toLowerCase();
  const scored = names.map(n => {
    const l = n.toLowerCase();
    let score = 0;
    if (l === q) score = 100;
    else if (l.startsWith(q)) score = 80;
    else if (l.includes(q)) score = 50;
    else {
      const parts = l.split(/(?=[A-Z])/).map(p => p.toLowerCase());
      if (parts.some(p => p.includes(q))) score = 30;
    }
    return { name: n, score };
  });
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.name);
}
```

### 2. Update `getTool` in `registry.ts`

```typescript
import { resolveAlias } from './aliases.js';

export function getTool(name: string): ToolDefinition | undefined {
  const all = [...tools, ...mcpTools, ...qtTools, ...mathTools];
  let found = all.find(t => t.name === name);
  if (!found) {
    const canonical = resolveAlias(name);
    if (canonical) found = all.find(t => t.name === canonical);
  }
  return found;
}
```

### 3. Verify
```bash
npm run check && npm test
```
