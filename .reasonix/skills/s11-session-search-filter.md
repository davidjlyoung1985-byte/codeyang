---
name: s11-session-search-filter
description: 会话搜索过滤 — 按日期/内容过滤 + messageCount
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Session Search & Filter

Add search and date filtering for saved sessions.

## Tasks

### 1. Add `searchSessions` to `src/utils/sessionStore.ts`

```typescript
export interface SessionSearchResult {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export async function searchSessions(query?: string, days?: number): Promise<SessionSearchResult[]> {
  const all = await listSessions();
  let filtered = all;
  
  // Filter by recency
  if (days && days > 0) {
    const cutoff = Date.now() - days * 86400000;
    filtered = filtered.filter(s => new Date(s.updatedAt).getTime() > cutoff);
  }
  
  // Filter by text query
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(s => s.title.toLowerCase().includes(q));
  }
  
  // Enrich with message count by reading the session file
  const enriched: SessionSearchResult[] = [];
  for (const s of filtered) {
    try {
      const session = await loadSession(s.id);
      enriched.push({
        ...s,
        messageCount: session?.messages.length ?? 0,
      });
    } catch {
      enriched.push({ ...s, messageCount: 0 });
    }
  }
  
  return enriched;
}
```

### 2. Update `--list` to support filter

```typescript
if (args.includes('--list') || args.includes('-l')) {
  const query = args[args.indexOf('--list') + 1] || args[args.indexOf('-l') + 1];
  // Don't consume next arg if it starts with --
  const searchQuery = query && !query.startsWith('-') ? query : undefined;
  const sessions = searchQuery 
    ? await searchSessions(searchQuery)
    : (await listSessions()).map(s => ({ ...s, messageCount: 0 }));
  
  if (sessions.length === 0) {
    console.log(searchQuery ? `No sessions matching "${searchQuery}".` : 'No saved sessions.');
    process.exit(0);
  }
  for (const s of sessions) {
    const msgInfo = s.messageCount ? ` ${s.messageCount}msgs` : '';
    console.log(`${s.id.slice(0,12)}  ${s.title.slice(0,50).padEnd(50)}  ${s.updatedAt.slice(0,10)}${msgInfo}`);
  }
  process.exit(0);
}
```

### 3. Update help text

### 4. Verify
```bash
npm run check && npm test
```
