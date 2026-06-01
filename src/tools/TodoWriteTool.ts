export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

// In-memory todo state for the current agent session
let currentTodos: TodoItem[] = [];

export function getTodos(): TodoItem[] {
  return currentTodos;
}

export function resetTodos(): void {
  currentTodos = [];
}

export async function executeTodoWrite(todos: TodoItem[]): Promise<string> {
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

  const normalized: TodoItem[] = todos.map((t) => ({
    content: String(t.content ?? ''),
    status: validStatuses.has(t.status) ? t.status : 'pending',
    priority: validPriorities.has(t.priority) ? t.priority : 'medium',
  }));

  // Merge with existing todos: update by content match, add new ones
  const existingMap = new Map(currentTodos.map((t) => [t.content, t]));
  for (const item of normalized) {
    existingMap.set(item.content, item);
  }

  // Save existing todos before overwriting
  const prevTodos = currentTodos;

  // Start with new normalized items (excluding completed/cancelled)
  currentTodos = normalized.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');

  // Also keep any existing items not in the new list that are in_progress or pending
  for (const item of prevTodos) {
    if (item.status === 'completed' || item.status === 'cancelled') continue;
    if (!normalized.some((t) => t.content === item.content)) {
      currentTodos.push(item);
    }
  }

  // Format output
  const statusIcons: Record<string, string> = {
    pending: '[ ]',
    in_progress: '[~]',
    completed: '[x]',
    cancelled: '[-]',
  };

  const statusCounts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const t of todos) {
    statusCounts[t.status]++;
  }

  const lines: string[] = [`## Todo List (${currentTodos.length} active)`];
  const grouped: Record<string, TodoItem[]> = {
    in_progress: [],
    pending: [],
    cancelled: [],
    completed: [],
  };

  for (const t of todos) {
    (grouped[t.status] ??= []).push(t);
  }

  for (const status of ['in_progress', 'pending', 'completed', 'cancelled'] as const) {
    const items = grouped[status];
    if (items.length === 0) continue;
    lines.push(`\n### ${status.replace('_', ' ')}:`);
    for (const item of items) {
      const icon = statusIcons[item.status] ?? '?';
      lines.push(`  ${icon} [${item.priority}] ${item.content}`);
    }
  }

  return lines.join('\n');
}
