---
name: add-global-error-handler
description: 添加全局错误处理器 + SIGINT 原子退出保护
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Global Error Handler & Process Safety

You are a resilience specialist. Add global error handling and process safety to CodeYang.

## Context

The main process in `src/index.ts` catches some errors but lacks:
- Unhandled promise rejection handler
- 'uncaughtException' handler
- Graceful shutdown on SIGTERM/SIGINT (partial)

## Tasks

### 1. Add Global Handlers in `src/index.ts`

Add at the beginning of `main()`:

```typescript
// Global error handlers
process.on('unhandledRejection', (reason) => {
  console.error('\n⚠️ Unhandled rejection:', reason instanceof Error ? reason.message : String(reason));
});

process.on('uncaughtException', (err) => {
  console.error('\n❌ Uncaught exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});
```

### 2. Refactor SIGINT/SIGTERM Handler

The current handler has a race condition: `sigintCount++` then check. Use a single atomic flag:

```typescript
let shuttingDown = false;

const sigintHandler = async () => {
  if (shuttingDown) {
    console.log('\nForce quitting...');
    process.exit(1);
  }
  shuttingDown = true;
  
  console.log('\n\nSaving session before exit... (Ctrl+C again to force quit)');
  
  try {
    agent.cancelQuestion();
    if (running) {
      await saveSession(agent.exportMessages(), currentSessionId);
      console.log('Session saved.');
    }
    await mcpMgr.shutdown();
  } catch {
    // Best-effort shutdown
  }
  process.exit(0);
};
```

### 3. Add Cleanup Function

Add a `cleanup()` function that's called in both normal exit and error paths:

```typescript
async function cleanup() {
  try {
    await mcpMgr.shutdown();
  } catch {
    // Ignore shutdown errors
  }
}
```

### 4. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/index.ts` — add global handlers, refactor SIGINT
