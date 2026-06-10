import type { ToolDefinition } from '../../types.js';
import { executeTaskCreate } from '../TaskCreateTool.js';
import { executeTaskGet } from '../TaskGetTool.js';
import { executeTaskUpdate } from '../TaskUpdateTool.js';
import { executeTaskList } from '../TaskListTool.js';
import { executeTaskStop } from '../TaskStopTool.js';
import { executeTaskOutput } from '../TaskOutputTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'TaskCreate',
    description:
      'Create a new task with title, description, priority, tags, and dependencies. ' +
      'Returns the task ID for later reference.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title (required)' },
        description: { type: 'string', description: 'Task description (optional)' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Priority level (default: medium)',
        },
        tags: { type: 'string', description: 'Comma-separated tags (optional)' },
        dependencies: { type: 'string', description: 'Comma-separated task IDs this task depends on (optional)' },
      },
      required: ['title'],
    },
    execute: async (args) => executeTaskCreate(args as any),
  },
  {
    name: 'TaskGet',
    description: 'Get detailed information about a task by ID, including description, status, progress, and output.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to retrieve' },
      },
      required: ['id'],
    },
    execute: async (args) => executeTaskGet(String(args['id'] ?? '')),
  },
  {
    name: 'TaskUpdate',
    description:
      'Update a task: change title, description, status, priority, progress percentage, or append output. ' +
      'Use when a task progresses, completes, or needs modification.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to update' },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
          description: 'New status (optional)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'New priority (optional)',
        },
        progress: { type: 'number', description: 'Progress percentage 0-100 (optional)' },
        output: { type: 'string', description: 'Append to task output (optional)' },
      },
      required: ['id'],
    },
    execute: async (args) => executeTaskUpdate(args as any),
  },
  {
    name: 'TaskList',
    description:
      'List tasks with optional filtering by status, priority, tags, or search keyword. ' +
      'Use at the start of a session to see what needs to be done.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
          description: 'Filter by status (optional)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Filter by priority (optional)',
        },
        tags: { type: 'string', description: 'Filter by comma-separated tags (optional)' },
        search: { type: 'string', description: 'Search keyword in title/description (optional)' },
      },
      required: [],
    },
    execute: async (args) => executeTaskList(args as any),
  },
  {
    name: 'TaskStop',
    description: 'Stop a running or pending task by ID. Sets its status to cancelled.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to stop' },
      },
      required: ['id'],
    },
    execute: async (args) => executeTaskStop(String(args['id'] ?? '')),
  },
  {
    name: 'TaskOutput',
    description: 'Read the accumulated output of a task by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to read output from' },
      },
      required: ['id'],
    },
    execute: async (args) => executeTaskOutput(String(args['id'] ?? '')),
  },
];
