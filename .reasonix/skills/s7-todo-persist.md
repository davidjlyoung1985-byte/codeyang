---
name: s7-todo-persist
description: TodoWrite 持久化 — 跨会话保存/恢复任务列表
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# TodoWrite Persistence

Store todos in `~/.codeyang/todos.json` across sessions.

## Tasks

### 1. Create `src/utils/todoStore.ts`

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DIR = join(homedir(), '.codeyang');
const FILE = join(DIR, 'todos.json');

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(todos, null, 2));
}

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    return JSON.parse(await readFile(FILE, 'utf-8'));
  } catch { return []; }
}

export async function clearTodos(): Promise<void> {
  await saveTodos([]);
}
```

### 2. Update `src/tools/TodoWriteTool.ts`

```typescript
import { saveTodos, loadTodos, type TodoItem } from '../utils/todoStore.js';

export async function executeTodoWrite(todos: Array<{ content: string; status: string; priority: string }>): Promise<string> {
  const now = new Date().toISOString();
  const existing = await loadTodos();
  const existingMap = new Map(existing.map(t => [t.content, t]));
  
  const items: TodoItem[] = todos.map(t => ({
    content: t.content,
    status: t.status as TodoItem['status'],
    priority: t.priority as TodoItem['priority'],
    createdAt: existingMap.get(t.content)?.createdAt ?? now,
    updatedAt: now,
  }));
  
  await saveTodos(items);
  
  const active = items.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const done = items.filter(t => t.status === 'completed');
  const cancelled = items.filter(t => t.status === 'cancelled');
  
  let out = `Todos saved (${items.length}: ${active.length} active, ${done.length} done, ${cancelled.length} cancelled)`;
  if (active.length > 0) {
    out += '\n\nActive:';
    for (const t of active) {
      out += `\n  ${t.status === 'in_progress' ? '→' : '·'} ${t.content} (${t.priority})`;
    }
  }
  return out;
}
```

### 3. Verify
```bash
npm run check && npm test
```
