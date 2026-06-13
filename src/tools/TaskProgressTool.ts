/**
 * TaskProgressTool - Update task progress with UI feedback
 */
import { ToolDefinition } from '../types.js';
import { updateTask, getTask } from '../utils/taskStore.js';
import { toolErrorWithActions } from './errors.js';

export const taskProgressDef: ToolDefinition = {
  name: 'TaskProgress',
  description: 'Update task progress percentage (0-100) with visual feedback',
  parameters: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'Task identifier',
      },
      progress: {
        type: 'number',
        description: 'Progress percentage (0-100)',
      },
    },
    required: ['task_id', 'progress'],
  },
  execute: async (args: Record<string, unknown>) => {
    return executeTaskProgress(args as { task_id: string; progress: number });
  },
};

export async function executeTaskProgress(args: { task_id: string; progress: number }): Promise<string> {
  const { task_id, progress } = args;

  if (progress < 0 || progress > 100) {
    return toolErrorWithActions({
      severity: 'error',
      context: 'Task',
      message: 'Progress must be between 0 and 100',
      actions: ['Provide a valid progress percentage'],
    });
  }

  const task = await getTask(task_id);
  if (!task) {
    return toolErrorWithActions({
      severity: 'error',
      context: 'Task',
      message: `Task not found: ${task_id}`,
      actions: ['Verify the task ID', 'List tasks to find the correct ID'],
    });
  }

  await updateTask(task_id, { progress });

  return `✅ Task progress updated: ${task.title} - ${progress}%`;
}
