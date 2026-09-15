/**
 * Task store tools: TaskCreate / TaskGet / TaskUpdate / TaskList / TaskStop / TaskOutput.
 *
 * Thin wrappers over utils/taskStore.ts, consumed only by definitions/task.def.ts.
 * Merged from six one-function files (ponytail: fewest files possible).
 */
import { createTask, getTask, updateTask, listTasks } from '../utils/taskStore.js';

export async function executeTaskCreate(args: {
  title: string;
  description?: string;
  priority?: string;
  tags?: string | string[];
  dependencies?: string | string[];
}): Promise<string> {
  const tags =
    typeof args.tags === 'string'
      ? args.tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : (args.tags ?? []);
  const deps =
    typeof args.dependencies === 'string'
      ? args.dependencies
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : (args.dependencies ?? []);

  const task = await createTask({
    title: args.title,
    description: args.description,
    priority: args.priority as 'low' | 'medium' | 'high' | 'critical' | undefined,
    tags,
    dependencies: deps,
  });

  return `Created task: ${task.id}\nTitle: ${task.title}\nPriority: ${task.priority}\nStatus: ${task.status}`;
}

export async function executeTaskGet(id: string): Promise<string> {
  const task = await getTask(id);
  if (!task) return `Task not found: ${id}`;

  return [
    `Task: ${task.id}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Progress: ${task.progress}%`,
    `Tags: ${task.tags.join(', ') || '(none)'}`,
    `Dependencies: ${task.dependencies.join(', ') || '(none)'}`,
    `Created: ${task.createdAt}`,
    `Updated: ${task.updatedAt}`,
    task.description ? `\nDescription:\n${task.description}` : '',
    task.output ? `\nOutput:\n${task.output.slice(0, 2000)}` : '',
  ].join('\n');
}

export async function executeTaskUpdate(args: {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  progress?: number;
  output?: string;
}): Promise<string> {
  const updates: Record<string, string | number | undefined> = {};
  if (args.title !== undefined) updates.title = args.title;
  if (args.description !== undefined) updates.description = args.description;
  if (args.status !== undefined) updates.status = args.status;
  if (args.priority !== undefined) updates.priority = args.priority;
  if (args.progress !== undefined) updates.progress = args.progress;
  if (args.output !== undefined) updates.output = args.output;

  const task = await updateTask(args.id, updates);
  if (!task) return `Task not found: ${args.id}`;

  return `Updated task: ${args.id}\nStatus: ${task.status}  |  Progress: ${task.progress}%`;
}

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
    lines.push(
      `  ${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '►' : '○'} ${t.id.slice(0, 16)}  ${t.title.slice(0, 60)}  [${t.status}]  ${t.priority}`,
    );
  }
  return lines.join('\n');
}

export async function executeTaskStop(id: string): Promise<string> {
  const task = await getTask(id);
  if (!task) return `Task not found: ${id}`;
  if (task.status !== 'in_progress' && task.status !== 'pending') {
    return `Task ${id} is already ${task.status}. No need to stop.`;
  }

  await updateTask(id, { status: 'cancelled' });
  return `Stopped task: ${id}`;
}

export async function executeTaskOutput(id: string): Promise<string> {
  const task = await getTask(id);
  if (!task) return `Task not found: ${id}`;

  return task.output || `(no output for task: ${id})`;
}
