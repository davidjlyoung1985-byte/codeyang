import { createTask } from '../utils/taskStore.js';

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
