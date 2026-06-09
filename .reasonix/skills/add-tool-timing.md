---
name: add-tool-timing
description: 添加工具执行计时 + 批量进度显示 (2/5)
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Progress Bar & Tool Execution Time Tracking

You are a UI specialist. Add execution time tracking and a progress bar for multi-tool batches.

## Context

The CLI currently shows individual tool results with a simple icon (`>` for start, `·` for done), but doesn't show:
- How many tools are in the current batch
- How long each tool took
- Overall progress (2/5 completed)

## Tasks

### 1. Add Time Tracking in `src/ui/CliUI.ts`

```typescript
// Add these properties to CliUI class
private toolStartTimes = new Map<string, number>();
private toolBatchTotal = 0;
private toolResultsCount = 0;

setToolProgressTotal(total: number) {
  this.toolBatchTotal = total;
  this.toolResultsCount = 0;
}

showToolCall(name: string, args: Record<string, unknown>) {
  this.spinner.stop();
  this.toolStartTimes.set(name, Date.now());
  const argStr = /* existing logic */;
  const icon = name === 'Question' ? '?' : '>';
  // Show: > Bash (1/5) cmds="npm test"
  const progress = this.toolBatchTotal > 0 
    ? ` (${this.toolResultsCount + 1}/${this.toolBatchTotal})` 
    : '';
  process.stdout.write(`\n  ${c.dim(`${c.cyan(icon)} ${c.white(name)}${progress}`)} ${c.dim(argStr)}\n`);
}

showToolResult(name: string, output: string, isError: boolean) {
  const elapsed = this.toolStartTimes.get(name);
  const duration = elapsed ? ` ${c.dim(`[${Date.now() - elapsed}ms]`)}` : '';
  this.toolResultsCount++;
  const firstLine = output.split('\n')[0] || '(empty)';
  const display = firstLine.slice(0, 150);
  if (isError) {
    console.log(`  ${c.red('✗')}${duration} ${c.dim(display)}`);
  } else {
    console.log(`  ${c.dim('·')}${duration} ${c.dim(display)}`);
  }
}
```

### 2. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/ui/CliUI.ts` — add time tracking and batch progress
