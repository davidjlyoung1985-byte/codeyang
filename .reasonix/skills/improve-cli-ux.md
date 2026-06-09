---
name: improve-cli-ux
description: CLI 用户体验改进 — 命令历史、Tab 补全、更友好的错误提示
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# CLI UX Improvements

You are a CLI/user-experience specialist. Your mission is to improve CodeYang's terminal user interface.

## Context

`src/ui/CliUI.ts` — the terminal interface. Currently uses raw `readline` with basic input handling.

## Tasks

### 1. Add Readline History

**Problem**: `readline` by default doesn't persist history between sessions or provide up-arrow navigation. Node.js `readline` supports `historySize` — enable it.

**Fix** in `src/ui/CliUI.ts`:

Add `historySize` option to readline constructor:
```typescript
this.rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  prompt: '',
  historySize: 50,  // Enable up-arrow history
});
```

**Note**: This enables in-session history (up-arrow to recall previous commands). Cross-session persistence would require writing to a file — too complex for this pass.

### 2. Improve Tool Error Display

**Problem**: When a tool returns an error, `showToolResult` truncates to 150 chars. This can hide critical error details.

**Fix**: Show first 120 chars + a hint to see full error:
```typescript
showToolResult(output: string, isError: boolean) {
  if (isError) {
    const display = output.split('\n')[0]?.slice(0, 120) || '(empty)';
    const lines = output.split('\n').length;
    const suffix = lines > 1 ? `  (${lines} lines — see full error above)` : '';
    console.log(`  ${c.red('✗')} ${c.dim(display)}${suffix}`);
  } else {
    const firstLine = output.split('\n')[0] || '(empty)';
    const display = firstLine.slice(0, 150);
    console.log(`  ${c.dim('·')} ${c.dim(display)}`);
  }
}
```

### 3. Add Command Suggestions for /commands

**Problem**: When a user types an unknown `/command`, they get a generic error. Add fuzzy suggestions.

**Fix** in `src/index.ts` — add command matching to the input handler (before the switch):

```typescript
if (lower.startsWith('/')) {
  const validCommands = ['/clear', '/sessions', '/tools', '/model', '/mcp', '/exit', '/quit'];
  if (!validCommands.includes(lower)) {
    // Find closest match
    const suggestions = validCommands.filter(c => c.startsWith(lower) || c.includes(lower.slice(1)));
    const hint = suggestions.length > 0
      ? `Did you mean: ${suggestions.join(', ')}?`
      : `Available: ${validCommands.join(', ')}`;
    console.log(`  ${c.dim(hint)}`);
    ui.promptUser();
    return;
  }
}
```

### 4. Spinner Enhancement

**Problem**: The spinner only shows "thinking" with elapsed time. For slow responses, show which operation is taking time.

**Check**: The existing spinner already shows elapsed time. The `setToolProgressTotal` already counts tool calls. But individual tool progress isn't shown in the spinner. 

**Minor fix**: Update the spinner label when tools are executing:
```typescript
showToolCall(name: string, args: Record<string, unknown>) {
  this.spinner.stop();
  // ... existing code ...
  // Show a brief spinner after tool calls start
  this.spinner.start(`executing ${name}`);
}
```

### 5. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/ui/CliUI.ts` — readline history, error display, spinner on tool execution
- `src/index.ts` — command suggestion for unknown /commands
