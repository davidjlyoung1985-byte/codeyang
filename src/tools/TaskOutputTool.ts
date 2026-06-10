import { getTask } from '../utils/taskStore.js';

export async function executeTaskOutput(id: string): Promise<string> {
  const task = await getTask(id);
  if (!task) return `Task not found: ${id}`;

  return task.output || `(no output for task: ${id})`;
}
