import { getTask, updateTask } from '../utils/taskStore.js';

export async function executeTaskStop(id: string): Promise<string> {
  const task = await getTask(id);
  if (!task) return `Task not found: ${id}`;
  if (task.status !== 'in_progress' && task.status !== 'pending') {
    return `Task ${id} is already ${task.status}. No need to stop.`;
  }

  await updateTask(id, { status: 'cancelled' });
  return `Stopped task: ${id}`;
}
