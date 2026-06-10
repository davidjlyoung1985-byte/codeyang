---
name: s12-undo-redo
description: 文件编辑撤销/重做 — 历史栈 + /undo /redo 命令
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# File Edit Undo/Redo

Add undo/redo history for file edits within a session.

## Tasks

### 1. Create `src/utils/editHistory.ts`

```typescript
interface EditEntry {
  filePath: string;
  previousContent: string;
  timestamp: number;
}

class EditHistory {
  private stack: EditEntry[] = [];
  private redoStack: EditEntry[] = [];
  private readonly MAX_HISTORY = 50;

  push(filePath: string, previousContent: string): void {
    this.stack.push({ filePath, previousContent, timestamp: Date.now() });
    if (this.stack.length > this.MAX_HISTORY) this.stack.shift();
    this.redoStack = []; // Clear redo on new edit
  }

  undo(): EditEntry | null {
    const entry = this.stack.pop();
    if (entry) this.redoStack.push(entry);
    return entry ?? null;
  }

  redo(): EditEntry | null {
    const entry = this.redoStack.pop();
    if (entry) this.stack.push(entry);
    return entry ?? null;
  }

  clear(): void {
    this.stack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean { return this.stack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}

export const editHistory = new EditHistory();
```

### 2. Integrate into `src/tools/EditTool.ts`

```typescript
import { editHistory } from '../utils/editHistory.js';

export async function executeEdit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<string> {
  // Before edit: save original content to history
  const { readFile } = await import('node:fs/promises');
  try {
    const prevContent = await readFile(filePath, 'utf-8');
    editHistory.push(filePath, prevContent);
  } catch {}
  // ... rest of edit logic
}
```

### 3. Add `/undo` and `/redo` commands to `src/index.ts`

```typescript
if (lower === '/undo') {
  const entry = editHistory.undo();
  if (!entry) {
    console.log('  Nothing to undo.');
  } else {
    await writeFile(entry.filePath, entry.previousContent);
    console.log(`  Undone edit to ${entry.filePath}`);
  }
  ui.promptUser();
  return;
}

if (lower === '/redo') {
  // Similar
}
```

Import at top:
```typescript
import { editHistory } from './utils/editHistory.js';
```

### 4. Verify
```bash
npm run check && npm test
```
