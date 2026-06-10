import { listTasks } from '../utils/taskStore.js';

export async function executeTaskList(args: {
  status?: string;
  priority?: string;
  tags?: string;
  search?: string;
}): Promise<string> {
  const tasks = await listTasks({
    status: args.status as 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | undefined,
    priority: args.priority as 'low' | 'medium' | 'high' | 'critical' | undefined,
    tags: args.tags ? args.tags.split(',').map((s) => s.trim()) : undefined,
    search: args.search,
  });

  if (tasks.length === 0) {
    const filters = [args.status, args.priority, args.search].filter(Boolean).join(', ');
    return filters ? `No tasks found matching: ${filters}` : 'No tasks yet. Create one with TaskCreate.';
  }

  const lines: string[] = [`Tasks (${tasks.length}):`, ''];
  for (const t of tasks) {
    lines.push(`  ${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '►' : '○'} ${t.id.slice(0, 16)}  ${t.title.slice(0, 60)}  [${t.status}]  ${t.priority}`);
  }
  return lines.join('\n');
}
