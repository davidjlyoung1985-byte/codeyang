import type { ToolDefinition } from '../types.js';
import { executeBash } from './BashTool.js';
import { executeRead } from './ReadTool.js';
import { executeWrite } from './WriteTool.js';
import { executeEdit } from './EditTool.js';
import { executeGlob } from './GlobTool.js';
import { executeGrep } from './GrepTool.js';
import { executeTodoWrite } from './TodoWriteTool.js';
import { executeWebFetch } from './WebFetchTool.js';
import { executeTask } from './TaskTool.js';
import type Anthropic from '@anthropic-ai/sdk';

export interface ToolContext {
  anthropicClient: Anthropic;
  model: string;
  maxTokens: number;
  cwd: string;
}

let currentContext: ToolContext | null = null;

export function setToolContext(ctx: ToolContext | null) {
  currentContext = ctx;
}

export const tools: ToolDefinition[] = [
  {
    name: 'Bash',
    description: 'Execute a shell command. Use for running code, tests, file operations, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['command'],
    },
    execute: async (args) => {
      const command = String(args['command'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeBash(command, cwd);
    },
  },
  {
    name: 'Read',
    description: 'Read the contents of a file or list a directory. For files, optionally specify offset and limit for large files. For directories, returns a listing with entries sorted alphabetically (directories first).',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file' },
        offset: { type: 'number', description: 'Starting line (0-indexed)' },
        limit: { type: 'number', description: 'Number of lines to read' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const offset = args['offset'] !== undefined ? Number(args['offset']) : undefined;
      const limit = args['limit'] !== undefined ? Number(args['limit']) : undefined;
      return executeRead(filePath, offset, limit);
    },
  },
  {
    name: 'Write',
    description: 'Write content to a file. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['filePath', 'content'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const content = String(args['content'] ?? '');
      return executeWrite(filePath, content);
    },
  },
  {
    name: 'Edit',
    description: 'Edit a file by replacing exact text. Use for surgical code changes. Provide enough context in oldString for a unique match. Use replaceAll for renaming across the file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file to edit' },
        oldString: { type: 'string', description: 'The exact text to replace' },
        newString: { type: 'string', description: 'The replacement text' },
        replaceAll: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
      },
      required: ['filePath', 'oldString', 'newString'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const oldString = String(args['oldString'] ?? '');
      const newString = String(args['newString'] ?? '');
      const replaceAll = args['replaceAll'] === true;
      return executeEdit(filePath, oldString, newString, replaceAll);
    },
  },
  {
    name: 'Glob',
    description: 'Search for files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts")' },
        root: { type: 'string', description: 'Root directory (optional)' },
      },
      required: ['pattern'],
    },
    execute: async (args) => {
      const pattern = String(args['pattern'] ?? '');
      const root = args['root'] ? String(args['root']) : undefined;
      return executeGlob(pattern, root);
    },
  },
  {
    name: 'Grep',
    description: 'Search file contents for a regex pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search' },
        include: { type: 'string', description: 'File glob filter (e.g. "*.ts")' },
        path: { type: 'string', description: 'Directory to search (optional)' },
      },
      required: ['pattern'],
    },
    execute: async (args) => {
      const pattern = String(args['pattern'] ?? '');
      const include = args['include'] ? String(args['include']) : undefined;
      const path = args['path'] ? String(args['path']) : undefined;
      return executeGrep(pattern, include, path);
    },
  },
  {
    name: 'TodoWrite',
    description:
      'Create and maintain a structured task list for the current coding session. ' +
      'Tracks progress, organizes multi-step work, and surfaces status to the user. ' +
      'Use proactively when: the task requires 3+ distinct steps; the work is non-trivial; ' +
      'the user provides multiple tasks. Skip when the work is a single straightforward task.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Brief description of the task' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Current status' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level' },
            },
            required: ['content', 'status', 'priority'],
          },
          description: 'The updated todo list',
        },
      },
      required: ['todos'],
    },
    execute: async (args) => {
      const todos = (args['todos'] as Array<Record<string, unknown>>) ?? [];
      return executeTodoWrite(
        todos.map(t => ({
          content: String(t.content ?? ''),
          status: (t.status as 'pending' | 'in_progress' | 'completed' | 'cancelled') || 'pending',
          priority: (t.priority as 'high' | 'medium' | 'low') || 'medium',
        })),
      );
    },
  },
  {
    name: 'WebFetch',
    description:
      'Fetches content from a specified URL and returns it as text. ' +
      'Use for reading online documentation, API references, or any web resource. ' +
      'Accepts HTTP and HTTPS URLs. Content is automatically converted from HTML to readable text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch content from' },
        format: { type: 'string', enum: ['text', 'html'], description: 'Output format (default: text)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const format = args['format'] ? String(args['format']) : undefined;
      return executeWebFetch(url, format);
    },
  },
  {
    name: 'Task',
    description:
      'Launch a sub-agent to handle complex, multi-step tasks autonomously. ' +
      'Use for independent subtasks that can run without shared state. ' +
      'The sub-agent executes sequentially and returns a single final result. ' +
      'IMPORTANT: Use this to parallelize independent work units.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'A short (3-5 word) description of the task' },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of subtask descriptions to execute in order',
        },
      },
      required: ['description', 'subtasks'],
    },
    execute: async (args) => {
      const desc = String(args['description'] ?? '');
      const subtasks = (args['subtasks'] as string[]) ?? [];

      if (!currentContext) {
        return 'Task sub-agent is not available: no tool context configured.';
      }

      const { anthropicClient, model, maxTokens, cwd } = currentContext;
      return executeTask(anthropicClient, model, maxTokens, desc, subtasks, cwd);
    },
  },
  {
    name: 'Question',
    description: 'Ask the user a question when you need clarification or a decision.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Display text for the option' },
              description: { type: 'string', description: 'Explanation of what choosing this option means' },
            },
            required: ['label', 'description'],
          },
          description: 'Available choices (optional)',
        },
      },
      required: ['question'],
    },
    execute: async (args) => {
      const q = String(args['question'] ?? '');
      const options = args['options'] as Array<{ label: string; description: string }> | undefined;
      if (options && options.length > 0) {
        const opts = options.map((o, i) => `  ${i + 1}. ${o.label} — ${o.description}`).join('\n');
        return `[QUESTION] ${q}\n\nOptions:\n${opts}`;
      }
      return `[QUESTION] ${q}`;
    },
  },
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(t => t.name === name);
}

export function toolSchemas(): Array<{
  name: string;
  description: string;
  input_schema: { type: 'object'; properties?: unknown; required?: string[]; [k: string]: unknown };
}> {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as { type: 'object'; properties?: unknown; required?: string[]; [k: string]: unknown },
  }));
}
