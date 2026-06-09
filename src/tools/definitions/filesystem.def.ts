import type { ToolDefinition } from '../../types.js';
import {
  executeCopy,
  executeMove,
  executeDelete,
  executeMkdir,
  executeList,
  executeExists,
} from '../FileSystemTool.js';
import { requiredString, optionalBoolean } from '../validate.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'Copy',
    description: 'Copy a file or directory to a new location. Supports recursive directory copying.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file or directory path' },
        destination: { type: 'string', description: 'Destination path' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing files (default: false)' },
      },
      required: ['source', 'destination'],
    },
    execute: async (args) => {
      const source = requiredString(args, 'source');
      const destination = requiredString(args, 'destination');
      const overwrite = args['overwrite'] === true;
      return executeCopy(source, destination, overwrite);
    },
  },
  {
    name: 'Move',
    description: 'Move or rename a file or directory. Uses atomic rename when possible, falls back to copy+delete.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file or directory path' },
        destination: { type: 'string', description: 'Destination path' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing files (default: false)' },
      },
      required: ['source', 'destination'],
    },
    execute: async (args) => {
      const source = requiredString(args, 'source');
      const destination = requiredString(args, 'destination');
      const overwrite = args['overwrite'] === true;
      return executeMove(source, destination, overwrite);
    },
  },
  {
    name: 'Delete',
    description: 'Delete a file or directory. Use recursive=true for non-empty directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to file or directory to delete' },
        recursive: { type: 'boolean', description: 'Allow deleting non-empty directories (default: false)' },
        force: { type: 'boolean', description: 'Ignore errors if path does not exist (default: false)' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const targetPath = requiredString(args, 'path');
      const recursive = args['recursive'] === true;
      const force = args['force'] === true;
      return executeDelete(targetPath, recursive, force);
    },
  },
  {
    name: 'Mkdir',
    description: 'Create a directory. Creates parent directories by default.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' },
        recursive: { type: 'boolean', description: 'Create parent directories if needed (default: true)' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const dirPath = requiredString(args, 'path');
      const recursive = args['recursive'] !== false;
      return executeMkdir(dirPath, recursive);
    },
  },
  {
    name: 'List',
    description: 'List directory contents with optional detailed information (size, modified date).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        showHidden: { type: 'boolean', description: 'Show hidden files (starting with .) (default: false)' },
        details: { type: 'boolean', description: 'Show detailed information (size, date) (default: false)' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const dirPath = requiredString(args, 'path');
      const showHidden = args['showHidden'] === true;
      const details = args['details'] === true;
      return executeList(dirPath, showHidden, details);
    },
  },
  {
    name: 'Exists',
    description: 'Check if a path exists and get basic information (type, size, modified date).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to check' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const targetPath = requiredString(args, 'path');
      return executeExists(targetPath);
    },
  },
];
