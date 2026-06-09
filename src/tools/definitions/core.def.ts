import type { ToolDefinition } from '../../types.js';
import { executeBash } from '../BashTool.js';
import { executeRead } from '../ReadTool.js';
import { executeWrite } from '../WriteTool.js';
import { executeEdit } from '../EditTool.js';
import { executeGlob } from '../GlobTool.js';
import { executeGrep } from '../GrepTool.js';
import { executeTodoWrite } from '../TodoWriteTool.js';
import { executeWebFetch } from '../WebFetchTool.js';
import { executeTask } from '../TaskTool.js';
import { getCurrentContext } from '../registry.js';
import { requiredString, optionalString, optionalNumber } from '../validate.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'Bash',
    description: 'Execute a shell command. Use for running code, tests, file operations, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout_secs: { type: 'number', description: 'Timeout in seconds (default: 30). Use higher for builds.' },
      },
      required: ['command'],
    },
    execute: async (args) => {
      const command = requiredString(args, 'command');
      const cwd = optionalString(args, 'cwd');
      const timeoutSecs = optionalNumber(args, 'timeout_secs');
      return executeBash(command, cwd, timeoutSecs);
    },
  },
  {
    name: 'Read',
    description:
      'Read the contents of a file or list a directory. For files, optionally specify offset and limit for large files. For directories, returns a listing with entries sorted alphabetically (directories first).',
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
      const filePath = requiredString(args, 'filePath');
      const offset = optionalNumber(args, 'offset');
      const limit = optionalNumber(args, 'limit');
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
      const filePath = requiredString(args, 'filePath');
      const content = requiredString(args, 'content');
      return executeWrite(filePath, content);
    },
  },
  {
    name: 'Edit',
    description:
      'Edit a file by replacing exact text. Use for surgical code changes. Provide enough context in oldString for a unique match. Use replaceAll for renaming across the file.',
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
      const filePath = requiredString(args, 'filePath');
      const oldString = requiredString(args, 'oldString');
      const newString = requiredString(args, 'newString');
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
      const pattern = requiredString(args, 'pattern');
      const root = optionalString(args, 'root');
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
        context_lines: { type: 'number', description: 'Lines of context around each match (default: 0)' },
      },
      required: ['pattern'],
    },
    execute: async (args) => {
      const pattern = requiredString(args, 'pattern');
      const include = optionalString(args, 'include');
      const path = optionalString(args, 'path');
      const contextLines = optionalNumber(args, 'context_lines', 0) ?? 0;
      return executeGrep(pattern, include, path, contextLines);
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
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                description: 'Current status',
              },
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
      if (todos.length === 0) {
        throw new Error('Missing required parameter: todos');
      }
      return executeTodoWrite(
        todos.map((t) => ({
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
      const url = requiredString(args, 'url');
      const format = optionalString(args, 'format');
      return executeWebFetch(url, format);
    },
  },
  {
    name: 'Task',
    description:
      'Launch a sub-agent to handle a task autonomously. ' +
      'Two modes: (1) prompt — single instruction string for simple tasks; ' +
      '(2) subtasks array — multiple parallel subtasks for complex work. ' +
      'Sub-agents run in parallel. Question and Task tools are disabled inside sub-agents.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short description (3-5 words)' },
        prompt: {
          type: 'string',
          description: 'Single instruction for the sub-agent (use instead of subtasks for simple tasks)',
        },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of parallel subtask instructions (use instead of prompt for multi-step work)',
        },
      },
      required: ['description'],
    },
    execute: async (args) => {
      const desc = requiredString(args, 'description');
      const prompt = optionalString(args, 'prompt');
      const subtasks = prompt ? [prompt] : ((args['subtasks'] as string[]) ?? []);

      const ctx = getCurrentContext();
      if (!ctx) {
        return 'Task sub-agent is not available: no tool context configured.';
      }
      const { llmClient, model, maxTokens, cwd } = ctx;
      if (!llmClient) {
        return 'Task sub-agent is not available.';
      }
      return executeTask(llmClient, model, maxTokens, desc, subtasks, cwd);
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
      const q = requiredString(args, 'question');
      const options = args['options'] as Array<{ label: string; description: string }> | undefined;
      if (options && options.length > 0) {
        const opts = options.map((o, i) => `  ${i + 1}. ${o.label} — ${o.description}`).join('\n');
        return `[QUESTION] ${q}\n\nOptions:\n${opts}`;
      }
      return `[QUESTION] ${q}`;
    },
  },
];
