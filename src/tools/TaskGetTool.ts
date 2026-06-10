import { getTask } from '../utils/taskStore.js';

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
