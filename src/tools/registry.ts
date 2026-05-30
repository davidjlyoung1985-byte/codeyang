import type { ToolDefinition } from '../types.js';
import { executeBash } from './BashTool.js';
import { executeRead } from './ReadTool.js';
import { executeWrite } from './WriteTool.js';
import { executeEdit } from './EditTool.js';
import { executeGlob } from './GlobTool.js';
import { executeGrep } from './GrepTool.js';

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
    description: 'Read the contents of a file. Optionally specify offset and limit for large files.',
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
    name: 'Task',
    description: 'Break down a complex task into subtasks and run them. Use for multi-step operations.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What to accomplish' },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of subtask descriptions',
        },
      },
      required: ['description', 'subtasks'],
    },
    execute: async (args) => {
      const desc = String(args['description'] ?? '');
      const subtasks = args['subtasks'] as string[] ?? [];
      return `[Task] ${desc}\nSubtasks:\n${subtasks.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n\n(Task tool acknowledges the plan — execute subtasks individually.)`;
    },
  },
  {
    name: 'Question',
    description: 'Ask the user a question when you need clarification or a decision.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
      },
      required: ['question'],
    },
    execute: async (args) => {
      return `[QUESTION] ${args['question']}`;
    },
  },
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(t => t.name === name);
}

export function toolSchemas() {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}
