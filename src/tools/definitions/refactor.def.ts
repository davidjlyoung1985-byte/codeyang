/**
 * Refactor tool definitions — intelligent code refactoring operations
 */

import type { ToolDefinition } from '../../types.js';
import {
  executeRefactorRename,
  executeRefactorExtract,
  executeRefactorInline,
  executeRefactorOrganizeImports,
} from '../RefactorTool.js';
import { requiredString, requiredNumber } from '../validate.js';

export const refactorToolDefinitions: ToolDefinition[] = [
  {
    name: 'RefactorRename',
    description:
      'Rename a symbol (variable, function, class, etc.) across the entire file or project. Finds all references and updates them atomically. Supports JavaScript and TypeScript.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file containing the symbol to rename',
        },
        line: {
          type: 'number',
          description: 'Line number where the symbol is located (1-based)',
        },
        column: {
          type: 'number',
          description: 'Column number where the symbol is located (1-based)',
        },
        oldName: {
          type: 'string',
          description: 'Current name of the symbol',
        },
        newName: {
          type: 'string',
          description: 'New name for the symbol (must be a valid JavaScript identifier)',
        },
      },
      required: ['filePath', 'line', 'column', 'oldName', 'newName'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      const line = requiredNumber(args, 'line');
      const column = requiredNumber(args, 'column');
      const oldName = requiredString(args, 'oldName');
      const newName = requiredString(args, 'newName');
      return executeRefactorRename(filePath, line, column, oldName, newName);
    },
  },
  {
    name: 'RefactorExtract',
    description:
      'Extract selected code into a new function. Analyzes the code to determine parameters and return values automatically. Useful for breaking down large functions.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file',
        },
        startLine: {
          type: 'number',
          description: 'Start line of the selection (1-based)',
        },
        startColumn: {
          type: 'number',
          description: 'Start column of the selection (1-based)',
        },
        endLine: {
          type: 'number',
          description: 'End line of the selection (1-based)',
        },
        endColumn: {
          type: 'number',
          description: 'End column of the selection (1-based)',
        },
        functionName: {
          type: 'string',
          description: 'Name for the new extracted function',
        },
      },
      required: ['filePath', 'startLine', 'startColumn', 'endLine', 'endColumn', 'functionName'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      const startLine = requiredNumber(args, 'startLine');
      const startColumn = requiredNumber(args, 'startColumn');
      const endLine = requiredNumber(args, 'endLine');
      const endColumn = requiredNumber(args, 'endColumn');
      const functionName = requiredString(args, 'functionName');
      return executeRefactorExtract(filePath, startLine, startColumn, endLine, endColumn, functionName);
    },
  },
  {
    name: 'RefactorInline',
    description:
      'Inline a variable by replacing all its uses with its value, then remove the declaration. Useful for simplifying code by eliminating unnecessary variables.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file',
        },
        line: {
          type: 'number',
          description: 'Line number of the variable declaration (1-based)',
        },
        column: {
          type: 'number',
          description: 'Column number (1-based)',
        },
        variableName: {
          type: 'string',
          description: 'Name of the variable to inline',
        },
      },
      required: ['filePath', 'line', 'column', 'variableName'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      const line = requiredNumber(args, 'line');
      const column = requiredNumber(args, 'column');
      const variableName = requiredString(args, 'variableName');
      return executeRefactorInline(filePath, line, column, variableName);
    },
  },
  {
    name: 'RefactorOrganizeImports',
    description:
      'Organize and sort import statements. Groups imports into: 1) Node.js built-ins, 2) External packages, 3) Local files. Removes duplicates and sorts alphabetically within each group.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file',
        },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      return executeRefactorOrganizeImports(filePath);
    },
  },
];
