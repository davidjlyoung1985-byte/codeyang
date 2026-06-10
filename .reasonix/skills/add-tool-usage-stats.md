---
name: add-tool-usage-stats
description: 工具使用统计 — 记录每个工具调用次数和耗时
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Tool Usage Statistics

You are an analytics specialist. Add per-session tool usage statistics tracking.

## Context

Currently there's no way to see which tools the agent used, how many times, or how long they took. This data helps optimize the tool set and identify bottlenecks.

## Tasks

### 1. Add Stats Tracking in `src/agent/Agent.ts`

```typescript
interface ToolStats {
  calls: number;
  totalTimeMs: number;
  errors: number;
}

// Add to Agent class:
private toolStats = new Map<string, ToolStats>();

private recordToolCall(name: string, durationMs: number, isError: boolean): void {
  const stats = this.toolStats.get(name) ?? { calls: 0, totalTimeMs: 0, errors: 0 };
  stats.calls++;
  stats.totalTimeMs += durationMs;
  if (isError) stats.errors++;
  this.toolStats.set(name, stats);
}

// Public getter
getToolStats(): Record<string, ToolStats> {
  return Object.fromEntries(this.toolStats);
}
```

### 2. Track in Tool Execution Loop

In the `run()` method, around each tool execution, record timing:
```typescript
const toolStart = Date.now();
try {
  const output = await tool.execute(tc.input);
  const elapsed = Date.now() - toolStart;
  this.recordToolCall(tc.name, elapsed, false);
  // ... existing code ...
} catch (err) {
  const elapsed = Date.now() - toolStart;
  this.recordToolCall(tc.name, elapsed, true);
  // ... existing error handling ...
}
```

### 3. Add `/stats` Command in `src/index.ts`

```typescript
if (lower === '/stats') {
  const stats = agent.getToolStats();
  const entries = Object.entries(stats).sort((a, b) => b[1].calls - a[1].calls);
  
  if (entries.length === 0) {
    console.log('  No tools used yet in this session.');
  } else {
    console.log(`\n  Tool usage this session (${entries.length} tools):`);
    console.log(`  ${'Tool'.padEnd(20)} ${'Calls'.padEnd(6)} ${'Avg ms'.padEnd(8)} ${'Errors'}`);
    console.log(`  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(6)}`);
    for (const [name, s] of entries) {
      const avg = s.calls > 0 ? Math.round(s.totalTimeMs / s.calls) : 0;
      const errStr = s.errors > 0 ? `${s.errors}`.padEnd(6) : '0'.padEnd(6);
      console.log(`  ${name.padEnd(20)} ${String(s.calls).padEnd(6)} ${String(avg).padEnd(8)} ${errStr}`);
    }
    console.log('');
  }
  ui.promptUser();
  return;
}
```

### 4. Add to Help Text

Add to the `/commands` error suggestion list: `/stats`

### 5. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/agent/Agent.ts` — add toolStats tracking
- `src/index.ts` — add /stats command
