---
name: s15-stream-optimize
description: 流式响应优化 — 50ms 批量化减少 UI 闪烁
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Stream Response Optimization

Reduce UI flickering and batch token rendering for smoother display.

## Tasks

### 1. Add batching to `src/ui/CliUI.ts`

```typescript
private streamBatch: string[] = [];
private batchTimer: ReturnType<typeof setTimeout> | null = null;
private readonly BATCH_DELAY_MS = 50;

// Replace direct process.stdout.write in showAgentDelta:
showAgentDelta(text: string) {
  if (this.spinner.active) {
    this.spinner.stop();
    if (!this.isFirstResponse) process.stdout.write('\n');
    this.isFirstResponse = false;
  }
  
  // Batch tokens
  this.streamBatch.push(text);
  if (!this.batchTimer) {
    this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_DELAY_MS);
  }
}

private flushBatch() {
  this.batchTimer = null;
  const batch = this.streamBatch.join('');
  this.streamBatch = [];
  // Write batch at once (replace newlines with newline + indent)
  process.stdout.write(batch.replace(/\n/g, '\n  '));
  this.streamBuf += batch;
}
```

### 2. Add `clearBatch()` to handle interruptions

```typescript
clearBatch() {
  if (this.batchTimer) {
    clearTimeout(this.batchTimer);
    this.batchTimer = null;
  }
  if (this.streamBatch.length > 0) {
    this.flushBatch();
  }
}
```

Call `clearBatch()` in `showAgentDone()`, `showAgentText()`, `showToolCall()`, `showError()`.

### 3. Verify
```bash
npm run check && npm test
```
