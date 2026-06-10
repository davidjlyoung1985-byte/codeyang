import { updateTask } from '../utils/taskStore.js';

export async function executeTaskUpdate(args: {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  progress?: number;
  output?: string;
}): Promise<string> {
  const updates: Record<string, any> = {};
  if (args.title !== undefined) updates.title = args.title;
  if (args.description !== undefined) updates.description = args.description;
  if (args.status !== undefined) updates.status = args.status;
  if (args.priority !== undefined) updates.priority = args.priority;
  if (args.progress !== undefined) updates.progress = args.progress;
  if (args.output !== undefined) updates.output = args.output;

  const task = await updateTask(args.id, updates as any);
  if (!task) return `Task not found: ${args.id}`;

  return `Updated task: ${args.id}\nStatus: ${task.status}  |  Progress: ${task.progress}%`;
}
