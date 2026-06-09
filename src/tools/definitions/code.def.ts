import type { ToolDefinition } from '../../types.js';
import {
  executeParseAst,
  executeAnalyzeCode,
  executeComplexity,
  executeLint,
  executeFindDeps,
  executeCountLines,
} from '../CodeAnalysisTool.js';
import { requiredString, optionalString, optionalBoolean } from '../validate.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'ParseAst',
    description: 'Parse JavaScript/TypeScript code and return AST information.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
        language: { type: 'string', enum: ['javascript', 'typescript'], description: 'Language (default: javascript)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      const language = (optionalString(args, 'language', 'javascript') ?? 'javascript') as 'javascript' | 'typescript';
      return executeParseAst(filePath, language);
    },
  },
  {
    name: 'AnalyzeCode',
    description: 'Analyze code structure and extract symbols (imports, exports, functions, classes, variables).',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
        language: { type: 'string', enum: ['javascript', 'typescript'], description: 'Language (default: javascript)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      const language = (optionalString(args, 'language', 'javascript') ?? 'javascript') as 'javascript' | 'typescript';
      return executeAnalyzeCode(filePath, language);
    },
  },
  {
    name: 'Complexity',
    description: 'Calculate code complexity metrics (cyclomatic complexity, nesting depth, branches).',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      return executeComplexity(filePath);
    },
  },
  {
    name: 'Lint',
    description: 'Run ESLint on a file to find code quality issues. Can auto-fix fixable issues.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
        fix: { type: 'boolean', description: 'Auto-fix fixable issues (default: false)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      const fix = optionalBoolean(args, 'fix', false) ?? false;
      return executeLint(filePath, fix);
    },
  },
  {
    name: 'FindDeps',
    description: 'Find and list project dependencies from package.json.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Project directory path' },
      },
      required: ['projectDir'],
    },
    execute: async (args) => {
      const projectDir = requiredString(args, 'projectDir');
      return executeFindDeps(projectDir);
    },
  },
  {
    name: 'CountLines',
    description: 'Count lines of code, comments, and blank lines in a file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      return executeCountLines(filePath);
    },
  },
];
