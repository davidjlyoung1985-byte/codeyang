---
name: add-todo-persistence
description: TodoWrite 持久化 — 跨会话保存/恢复任务列表
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# TodoWrite Persistence

You are a task management specialist. Add cross-session persistence for the TodoWrite tool.

## Context

`TodoWrite` manages task lists within a session, but the list is lost when the session ends. Users want to carry over unfinished tasks.

## Tasks

### 1. Add Todo Persistence in `src/utils/sessionStore.ts`

```typescript
export interface TodoData {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

interface SessionTodos {
  sessionId: string;
  updatedAt: string;
  todos: TodoData[];
}
```

### 2. Create `src/utils/todoStore.ts`

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TODO_FILE = join(homedir(), '.codeyang', 'todos.json');

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  await mkdir(join(homedir(), '.codeyang'), { recursive: true });
  await writeFile(TODO_FILE, JSON.stringify(todos, null, 2), 'utf-8');
}

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const data = await readFile(TODO_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function clearTodos(): Promise<void> {
  await saveTodos([]);
}
```

### 3. Update `src/tools/TodoWriteTool.ts`

Modify `executeTodoWrite` to persist todos across sessions:

```typescript
import { saveTodos, loadTodos, type TodoItem } from '../utils/todoStore.js';

export async function executeTodoWrite(todos: Array<{ content: string; status: string; priority: string }>): Promise<string> {
  const now = new Date().toISOString();
  
  // Load existing to preserve createdAt for unchanged items
  const existing = await loadTodos();
  const existingMap = new Map(existing.map(t => [t.content, t]));
  
  const items: TodoItem[] = todos.map(t => {
    const old = existingMap.get(t.content);
    return {
      content: t.content,
      status: t.status as TodoItem['status'],
      priority: t.priority as TodoItem['priority'],
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
  });
  
  await saveTodos(items);
  
  const pending = items.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completed = items.filter(t => t.status === 'completed');
  const cancelled = items.filter(t => t.status === 'cancelled');
  
  let output = `Todos saved (${items.length} total: ${pending.length} active, ${completed.length} done, ${cancelled.length} cancelled)`;
  
  if (pending.length > 0) {
    output += '\n\nActive:';
    for (const t of pending) {
      output += `\n  ${t.status === 'in_progress' ? '→' : '·'} ${t.content} (${t.priority})`;
    }
  }
  
  return output;
}
```

### 4. Verify

```bash
npm run check
npm test
```

## Files to Create
- `src/utils/todoStore.ts`

## Files to Edit
- `src/tools/TodoWriteTool.ts` — add persistence
