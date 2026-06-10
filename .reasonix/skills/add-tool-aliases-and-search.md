---
name: add-tool-aliases-and-search
description: 工具别名与搜索 — 支持短命令名 + 工具模糊搜索
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Tool Aliases & Fuzzy Search

You are a UX specialist. Add tool aliases and fuzzy name matching.

## Context

Tools have long names like `GitCurrentBranch` that users may not remember exactly. Add aliases and a fuzzy-search helper.

## Tasks

### 1. Create `src/tools/aliases.ts`

```typescript
/** Map of alias → canonical tool name */
export const TOOL_ALIASES: Record<string, string> = {
  // Git
  'git-branch': 'GitBranch',
  'branch': 'GitBranch',
  'git-commit': 'GitCommit',
  'commit': 'GitCommit',
  'git-status': 'GitStatus',
  'git-st': 'GitStatus',
  'status': 'GitStatus',
  'git-diff': 'GitDiff',
  'diff': 'GitDiff',
  'git-log': 'GitLog',
  'git-push': 'GitPush',
  'git-pull': 'GitPull',
  'git-add': 'GitAdd',
  'git-stash': 'GitStash',
  'git-merge': 'GitMerge',
  'git-clone': 'GitClone',
  'git-branch-curr': 'GitCurrentBranch',
  
  // FS
  'ls': 'List',
  'dir': 'List',
  'cp': 'Copy',
  'mv': 'Move',
  'rm': 'Delete',
  'del': 'Delete',
  'mkdir': 'Mkdir',
  'md': 'Mkdir',
  
  // Data
  'json': 'JsonParse',
  'yaml': 'YamlParse',
  'csv': 'CsvParse',
  'xml': 'XmlParse',
  
  // Search
  'find': 'Search',
  'grep': 'Grep',
  'glob': 'Glob',
  
  // Other
  'bash': 'Bash',
  'sh': 'Bash',
  'shell': 'Bash',
  'read': 'Read',
  'cat': 'Read',
  'write': 'Write',
  'edit': 'Edit',
  'fetch': 'WebFetch',
  'http': 'HttpRequest',
  'download': 'DownloadFile',
  'upload': 'UploadFile',
  'help': 'Question',
  'ask': 'Question',
};

/**
 * Resolve a tool name (possibly an alias) to its canonical form.
 * Returns undefined if no match found.
 */
export function resolveToolName(name: string): string | undefined {
  // Direct match
  if (TOOL_ALIASES[name.toLowerCase()]) {
    return TOOL_ALIASES[name.toLowerCase()];
  }
  
  // Fuzzy: find tools that contain the query as substring
  return undefined; // caller should handle fuzzy search
}

/**
 * Fuzzy search tool names. Returns all matching canonical names sorted by relevance.
 */
export function fuzzySearchTools(query: string, allToolNames: string[]): string[] {
  const q = query.toLowerCase();
  const results: Array<{ name: string; score: number }> = [];
  
  for (const name of allToolNames) {
    const lower = name.toLowerCase();
    
    // Exact match → highest score
    if (lower === q) {
      results.push({ name, score: 100 });
      continue;
    }
    
    // Starts with → high score
    if (lower.startsWith(q)) {
      results.push({ name, score: 80 });
      continue;
    }
    
    // Contains → medium score
    if (lower.includes(q)) {
      results.push({ name, score: 50 });
      continue;
    }
    
    // Contains as separate words (e.g., "git log" matches "GitLog")
    const parts = lower.split(/(?=[A-Z])/).map(p => p.toLowerCase());
    if (parts.some(p => p.includes(q))) {
      results.push({ name, score: 30 });
      continue;
    }
  }
  
  return results.sort((a, b) => b.score - a.score).map(r => r.name);
}
```

### 2. Integrate into `src/tools/registry.ts`

In `getTool()`, try alias resolution before returning undefined:

```typescript
export function getTool(name: string): ToolDefinition | undefined {
  // Check direct match first
  let result = tools.find((t) => t.name === name) 
    ?? mcpTools.find((t) => t.name === name) 
    ?? qtTools.find((t) => t.name === name)
    ?? mathTools.find((t) => t.name === name);
  
  // Try alias resolution
  if (!result) {
    const canonical = resolveToolName(name);
    if (canonical) {
      result = tools.find((t) => t.name === canonical)
        ?? mcpTools.find((t) => t.name === canonical)
        ?? qtTools.find((t) => t.name === canonical)
        ?? mathTools.find((t) => t.name === canonical);
    }
  }
  
  return result;
}
```

### 3. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/tools/aliases.ts`

## Files to Edit
- `src/tools/registry.ts` — update getTool to use aliases
