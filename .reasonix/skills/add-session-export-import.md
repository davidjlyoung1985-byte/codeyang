---
name: add-session-export-import
description: 会话导出/导入 — 将对话导出为 Markdown 或 JSON
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Session Export / Import

You are a persistence specialist. Add session export/import functionality to CodeYang.

## Context

Currently sessions are saved as JSON in `~/.codeyang/sessions/`. Users cannot export conversations as readable Markdown or share sessions with others.

## Tasks

### 1. Add `exportSession` to `src/utils/sessionStore.ts`

```typescript
import type { Session } from '../types.js';

export function sessionToMarkdown(session: Session): string {
  const lines: string[] = [];
  lines.push(`# CodeYang Session: ${session.title}`);
  lines.push(`> Created: ${session.createdAt}`);
  lines.push(`> Updated: ${session.updatedAt}`);
  lines.push('');
  
  for (const msg of session.messages) {
    if (msg.role === 'user') {
      lines.push(`## User\n\n${msg.content}\n`);
    } else if (msg.role === 'assistant') {
      const text = msg.content || '';
      lines.push(`## CodeYang\n\n${text}\n`);
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          lines.push(`> **Tool:** ${tc.name}`);
          lines.push(`> \`\`\`json\n> ${JSON.stringify(tc.args, null, 2).replace(/\n/g, '\n> ')}\n> \`\`\`\n`);
        }
      }
    }
  }
  
  return lines.join('\n');
}

export async function exportSessionAsMarkdown(id: string): Promise<string> {
  const session = await loadSession(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  return sessionToMarkdown(session);
}
```

### 2. Add CLI Commands in `src/index.ts`

Add `--export <id>` and `--export-md <id>` to the argument handler:
```typescript
if (args.includes('--export') && args[args.indexOf('--export') + 1]) {
  const sessionId = args[args.indexOf('--export') + 1];
  const md = await exportSessionAsMarkdown(sessionId);
  console.log(md);
  process.exit(0);
}

if (args.includes('--export-md') && args[args.indexOf('--export-md') + 1]) {
  const sessionId = args[args.indexOf('--export-md') + 1];
  const md = await exportSessionAsMarkdown(sessionId);
  const outPath = `session-${sessionId}.md`;
  await writeFile(outPath, md, 'utf-8');
  console.log(`Session exported to ${outPath}`);
  process.exit(0);
}
```

### 3. Update `--help` to show new commands

Add to the help output:
```
  --export <id>       Export a session as Markdown to stdout
  --export-md <id>    Export a session as Markdown to a file
```

### 4. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/utils/sessionStore.ts` — add export functions
- `src/index.ts` — add CLI args + help text
