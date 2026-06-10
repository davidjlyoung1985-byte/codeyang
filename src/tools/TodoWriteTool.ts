export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

// ── Persistence ──────────────────────────────────────────────────────────

import { saveTodos, loadTodos, clearTodos, type TodoItem as PersistedTodoItem } from '../utils/todoStore.js';

export async function getTodos(): Promise<TodoItem[]> {
  const persisted = await loadTodos();
  return persisted.map((t) => ({
    content: t.content,
    status: t.status,
    priority: t.priority,
  }));
}

export async function resetTodos(): Promise<void> {
  await clearTodos();
}

export async function executeTodoWrite(
  todos: Array<{ content: string; status: string; priority: string }>,
): Promise<string> {
  if (!Array.isArray(todos) || todos.length === 0) {
    return (
      'Usage: Provide a non-empty array of todo items, each with:\n' +
      '  - content: description of the task\n' +
      '  - status: "pending" | "in_progress" | "completed" | "cancelled"\n' +
      '  - priority: "high" | "medium" | "low"'
    );
  }

  // Validate and normalize incoming todos
  const validStatuses = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
  const validPriorities = new Set(['high', 'medium', 'low']);

  const now = new Date().toISOString();
  const existing = await loadTodos();
  const existingMap = new Map(existing.map((t) => [t.content, t]));

  const items: PersistedTodoItem[] = todos.map((t) => ({
    content: String(t.content ?? ''),
    status: (validStatuses.has(t.status) ? t.status : 'pending') as PersistedTodoItem['status'],
    priority: (validPriorities.has(t.priority) ? t.priority : 'medium') as PersistedTodoItem['priority'],
    createdAt: existingMap.get(t.content)?.createdAt ?? now,
    updatedAt: now,
  }));

  await saveTodos(items);

  // Format output
  const active = items.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const done = items.filter((t) => t.status === 'completed');
  const cancelled = items.filter((t) => t.status === 'cancelled');

  let out = `Todos saved (${items.length}: ${active.length} active, ${done.length} done, ${cancelled.length} cancelled)`;
  if (active.length > 0) {
    out += '\n\nActive:';
    for (const t of active) {
      out += `\n  ${t.status === 'in_progress' ? '→' : '·'} ${t.content} (${t.priority})`;
    }
  }
  return out;
}
