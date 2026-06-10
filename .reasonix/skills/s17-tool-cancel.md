---
name: s17-tool-cancel
description: 工具执行取消 — Ctrl+C 中断正在执行的工具批处理
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Tool Execution Cancellation

Allow interrupting a running tool batch with Ctrl+C.

## Tasks

### 1. Add cancellation support to `src/agent/Agent.ts`

```typescript
private abortController: AbortController | null = null;

cancelRunningTools(): void {
  if (this.abortController) {
    this.abortController.abort();
    this.abortController = null;
  }
}
```

### 2. Wrap tool execution with abort signal

In the `run()` method, before parallel tool execution:
```typescript
this.abortController = new AbortController();
const signal = this.abortController.signal;

const parallelTasks = toolCalls.map(async (tc, i) => {
  if (tc.name === 'Question') return;
  
  // Check if cancelled before starting
  if (signal.aborted) {
    toolResults[i] = { tool: tc.name, input: tc.input, output: '[Cancelled]', isError: true };
    return;
  }
  // ... rest of execution
});

await Promise.all(parallelTasks);
this.abortController = null;
```

### 3. Integrate into SIGINT handler (in `src/index.ts`)

```typescript
const sigintHandler = async () => {
  if (shuttingDown) { process.exit(1); }
  shuttingDown = true;
  
  if (running && agent.cancelRunningTools) {
    agent.cancelRunningTools();
    console.log('\n  Tool execution cancelled.');
    return;
  }
  // ... rest of shutdown logic
};
```

### 4. Verify
```bash
npm run check && npm test
```
