---
name: s19-multi-session-compare
description: 多会话对比 — 并排显示两个会话的工具调用和消息
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Multi-Session Comparison

Add CLI command to compare two sessions side-by-side.

## Tasks

### 1. Add `compareSessions` to `src/utils/sessionStore.ts`

```typescript
import type { Session } from '../types.js';

export function compareSessions(a: Session, b: Session): string {
  const lines: string[] = [];
  const dateA = new Date(a.createdAt).toLocaleString();
  const dateB = new Date(b.createdAt).toLocaleString();
  
  lines.push(`# Session Comparison\n`);
  lines.push(`| Metric | ${a.title.slice(0,30)} (${dateA}) | ${b.title.slice(0,30)} (${dateB}) |`);
  lines.push(`|--------|${'─'.repeat(30)}|${'─'.repeat(30)}|`);
  lines.push(`| Messages | ${a.messages.length} | ${b.messages.length} |`);
  
  const toolCallsA = a.messages.filter(m => m.toolCalls?.length).length;
  const toolCallsB = b.messages.filter(m => m.toolCalls?.length).length;
  lines.push(`| Tool calls | ${toolCallsA} | ${toolCallsB} |`);
  
  const errorsA = a.messages.filter(m => m.toolResults?.some(r => r.isError)).length;
  const errorsB = b.messages.filter(m => m.toolResults?.some(r => r.isError)).length;
  lines.push(`| Errors | ${errorsA} | ${errorsB} |`);
  
  return lines.join('\n');
}
```

### 2. Add `--compare` CLI arg to `src/index.ts`

```typescript
if (args.includes('--compare') && args[args.indexOf('--compare') + 1] && args[args.indexOf('--compare') + 2]) {
  const idA = args[args.indexOf('--compare') + 1];
  const idB = args[args.indexOf('--compare') + 2];
  const sessionA = await loadSession(idA);
  const sessionB = await loadSession(idB);
  if (!sessionA || !sessionB) {
    console.log(`Session not found: ${!sessionA ? idA : idB}`);
    process.exit(0);
  }
  console.log(compareSessions(sessionA, sessionB));
  process.exit(0);
}
```

### 3. Update help text
```
  --compare <id1> <id2>   Compare two sessions
```

### 4. Verify
```bash
npm run check && npm test
```
