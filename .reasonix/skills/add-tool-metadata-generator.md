---
name: add-tool-metadata-generator
description: 工具文档生成器 — 从 toolSchemas 自动生成 Markdown 文档
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Tool Documentation Generator

You are a documentation specialist. Add a tool that auto-generates Markdown documentation from tool schemas.

## Context

The README tool table needs manual updates whenever tools change. CodeYang has `toolSchemas()` which returns all tool metadata — use this to auto-generate docs.

## Tasks

### 1. Create `src/tools/auto-docs.ts`

A script that generates tool documentation from the actual schemas:

```typescript
import { toolSchemas } from './registry.js';

interface DocEntry {
  name: string;
  description: string;
  parameters: string;
  category: string;
}

const CATEGORY_MAP: Record<string, string> = {
  Bash: 'Core', Read: 'Core', Write: 'Core', Edit: 'Core',
  Glob: 'Search', Grep: 'Search', Search: 'Search',
  TodoWrite: 'Core', WebFetch: 'Network', Task: 'Core', Question: 'Core',
  Copy: 'File System', Move: 'File System', Delete: 'File System',
  Mkdir: 'File System', List: 'File System', Exists: 'File System',
  // ... map can be extended
};

function inferCategory(name: string): string {
  return CATEGORY_MAP[name] || 'Other';
}

function formatParameters(schema: { properties?: Record<string, unknown>; required?: string[] }): string {
  if (!schema.properties) return 'None';
  const props = Object.entries(schema.properties).map(([key, val]) => {
    const v = val as { type?: string; description?: string; enum?: string[] };
    const type = v.type || 'any';
    const desc = v.description || '';
    const enumStr = v.enum ? ` (${v.enum.join('|')})` : '';
    const required = schema.required?.includes(key) ? '**required**' : 'optional';
    return `  - \`${key}\`: ${type}${enumStr} — ${desc} _(${required})_`;
  });
  return props.join('\n');
}

export function generateDocs(): string {
  const schemas = toolSchemas();
  const entries: DocEntry[] = schemas.map(s => ({
    name: s.name,
    description: s.description.split('.')[0], // First sentence only
    parameters: formatParameters(s.input_schema as { properties?: Record<string, unknown>; required?: string[] }),
    category: inferCategory(s.name),
  }));

  // Group by category
  const grouped: Record<string, DocEntry[]> = {};
  for (const e of entries) {
    (grouped[e.category] ??= []).push(e);
  }

  let md = '# Tool Reference\n\n';
  md += `_Auto-generated from tool schemas. ${schemas.length} tools total._\n\n`;
  
  for (const [cat, tools] of Object.entries(grouped)) {
    md += `## ${cat}\n\n`;
    md += '| Tool | Description | Parameters |\n';
    md += '|------|-------------|------------|\n';
    for (const t of tools) {
      md += `| **${t.name}** | ${t.description} | ${t.parameters.replace(/\n/g, '<br>')} |\n`;
    }
    md += '\n';
  }
  
  return md;
}

// CLI entry: node dist/tools/auto-docs.js > TOOLS.md
if (process.argv[1]?.endsWith('auto-docs.js')) {
  console.log(generateDocs());
}
```

### 2. Add a script in `package.json`

```json
"generate-docs": "node -e \"import('./src/tools/auto-docs.js').then(m => console.log(m.generateDocs()))\""
```

### 3. Verify script runs

```bash
npm run generate-docs
```

### 4. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/tools/auto-docs.ts`

## Files to Edit
- `package.json` — add generate-docs script
