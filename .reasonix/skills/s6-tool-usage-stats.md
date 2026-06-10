---
name: s6-tool-usage-stats
description: 工具使用统计 — 记录调用次数/耗时 + /stats 命令
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Tool Usage Statistics

Track per-session tool usage and add `/stats` command.

## Tasks

### 1. Add tracking to `src/agent/Agent.ts`

```typescript
// Add near other private fields:
private toolStats = new Map<string, { calls: number; totalMs: number; errors: number }>();

// Add method:
recordToolCall(name: string, ms: number, isErr: boolean) {
  const s = this.toolStats.get(name) ?? { calls: 0, totalMs: 0, errors: 0 };
  s.calls++;
  s.totalMs += ms;
  if (isErr) s.errors++;
  this.toolStats.set(name, s);
}

getToolStats() {
  return Object.fromEntries(this.toolStats);
}
```

### 2. Track in `run()` method
Wrap tool execution with timing:
```typescript
const t0 = Date.now();
try {
  const output = await tool.execute(tc.input);
  this.recordToolCall(tc.name, Date.now() - t0, false);
  // ... rest
} catch (err) {
  this.recordToolCall(tc.name, Date.now() - t0, true);
  // ... rest
}
```

Reset stats in `reset()`:
```typescript
this.toolStats.clear();
```

### 3. Add `/stats` command in `src/index.ts`

```typescript
if (lower === '/stats') {
  const stats = agent.getToolStats();
  const entries = Object.entries(stats).sort((a, b) => b[1].calls - a[1].calls);
  if (!entries.length) {
    console.log('  No tools used yet.');
  } else {
    console.log(`\n  Tool Usage (${entries.length} tools):`);
    console.log(`  ${'Tool'.padEnd(20)} ${'Calls'.padEnd(6)} ${'Avg ms'.padEnd(8)} ${'Errors'}`);
    console.log(`  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(6)}`);
    for (const [n, s] of entries) {
      const avg = s.calls > 0 ? Math.round(s.totalMs / s.calls) : 0;
      console.log(`  ${n.padEnd(20)} ${String(s.calls).padEnd(6)} ${String(avg).padEnd(8)} ${String(s.errors).padEnd(6)}`);
    }
    console.log('');
  }
  ui.promptUser();
  return;
}
```

### 4. Add `/stats` to valid commands list

### 5. Verify
```bash
npm run check && npm test
```
