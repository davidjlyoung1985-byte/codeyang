---
name: s1-session-export
description: 会话导出/导入 — 支持 --export 和 --export-md CLI 参数
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Session Export/Import

Add session export to Markdown format and CLI commands.

## Tasks

### 1. Add export functions to `src/utils/sessionStore.ts`

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
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          lines.push(`> **Tool:** ${tc.name}`);
          lines.push(`> \`\`\`json\n> ${JSON.stringify(tc.args, null, 2).replace(/\n/g, '\n> ')}\n> \`\`\`\n`);
        }
      }
    }
  }
  return lines.join('\n') || '# (empty session)';
}

export async function exportSessionAsMarkdown(id: string): Promise<string> {
  const { loadSession } = await import('./sessionStore.js');
  const session = await loadSession(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  return sessionToMarkdown(session);
}
```

### 2. Add CLI commands in `src/index.ts`

After the `--delete` handler, add:
```typescript
const exportIdx = args.indexOf('--export');
if (exportIdx !== -1 && args[exportIdx + 1]) {
  const { exportSessionAsMarkdown } = await import('./utils/sessionStore.js');
  const sessionId = args[exportIdx + 1];
  try {
    const md = await exportSessionAsMarkdown(sessionId);
    console.log(md);
  } catch (err) {
    console.error(`Session export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(0);
}

const exportMdIdx = args.indexOf('--export-md');
if (exportMdIdx !== -1 && args[exportMdIdx + 1]) {
  const { exportSessionAsMarkdown } = await import('./utils/sessionStore.js');
  const { writeFile } = await import('node:fs/promises');
  const sessionId = args[exportMdIdx + 1];
  try {
    const md = await exportSessionAsMarkdown(sessionId);
    const outPath = `session-${sessionId.slice(0, 8)}.md`;
    await writeFile(outPath, md, 'utf-8');
    console.log(`Session exported to ${outPath}`);
  } catch (err) {
    console.error(`Session export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(0);
}
```

Add to help text:
```
  --export <id>       Export a session as Markdown to stdout
  --export-md <id>    Export a session as Markdown to a file
```

### 3. Verify
```bash
npm run check && npm test
```
