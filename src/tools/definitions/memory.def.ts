import type { ToolDefinition } from '../../types.js';
import { executeRemember, executeRecall, executeForget, executeListMemories } from '../MemoryTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'Remember',
    description:
      'Save a fact, preference, or piece of information to persistent memory. Use for user preferences, project details, decisions, or anything worth remembering across sessions.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'A short, descriptive key (e.g. "user_name", "project_goal", "preferred_test_framework")',
        },
        value: { type: 'string', description: 'The content to remember' },
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'project', 'instruction', 'context'],
          description: 'Category of memory (default: fact)',
        },
      },
      required: ['key', 'value'],
    },
    execute: async (args) => executeRemember(args),
  },
  {
    name: 'Recall',
    description: 'Retrieve memories by key, id, or search query. Returns matching memories from persistent storage.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID to retrieve (optional)' },
        query: { type: 'string', description: 'Search query to find related memories (optional)' },
      },
    },
    execute: async (args) => executeRecall(args),
  },
  {
    name: 'Forget',
    description: 'Delete a memory by its key or id.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key or id to delete' },
      },
      required: ['key'],
    },
    execute: async (args) => executeForget(args),
  },
  {
    name: 'ListMemories',
    description: 'List all saved memories, optionally filtered by type.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'project', 'instruction', 'context'],
          description: 'Filter by type (optional)',
        },
      },
    },
    execute: async (args) => executeListMemories(args),
  },
];
