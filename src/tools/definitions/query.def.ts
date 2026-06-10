import type { ToolDefinition } from '../../types.js';
import { executeLsp } from '../LSPTool.js';
import { listFiles, searchContent } from '../../utils/queryEngine.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'QuerySymbols',
    description:
      'List all symbols (functions, classes, interfaces, types) defined in a file. ' +
      'Use to understand the structure of a file before reading it.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file to analyze' },
      },
      required: ['filePath'],
    },
    execute: async (args) => executeLsp('symbols', String(args['filePath'] ?? '')),
  },
  {
    name: 'FindDefinition',
    description:
      'Find the definition of a symbol (function, class, variable) across the project. ' +
      'Returns file:line locations. Use when you need to understand how something is defined.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find' },
        inFile: { type: 'string', description: 'Optional: limit search to a specific file' },
      },
      required: ['symbol'],
    },
    execute: async (args) => executeLsp('definition', String(args['inFile'] ?? ''), undefined, String(args['symbol'] ?? '')),
  },
  {
    name: 'FindReferences',
    description:
      'Find all usages of a symbol across the project. ' +
      'Useful for understanding how a function or variable is used before making changes.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to search for' },
        inFile: { type: 'string', description: 'Optional: limit search to a specific file' },
      },
      required: ['symbol'],
    },
    execute: async (args) => executeLsp('references', String(args['inFile'] ?? ''), undefined, String(args['symbol'] ?? '')),
  },
  {
    name: 'SearchProject',
    description:
      'Fast project-wide content search using ripgrep. Supports file glob filtering. ' +
      'Use for finding specific strings, patterns, or usages across the entire codebase.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search pattern (plain text or regex)' },
        filePattern: { type: 'string', description: 'Optional: file glob filter e.g. "*.ts" or "*.rs"' },
        rootDir: { type: 'string', description: 'Optional: root directory to search (default: project root)' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '');
      const filePat = args['filePattern'] ? String(args['filePattern']) : undefined;
      const root = args['rootDir'] ? String(args['rootDir']) : process.cwd();
      const results = await searchContent(root, query, filePat);
      if (results.length === 0) return `No matches found for: ${query}`;
      const lines: string[] = [`Search results for "${query}" (${results.length}):`, ''];
      for (let i = 0; i < Math.min(results.length, 40); i++) {
        const r = results[i];
        lines.push(`  ${r.file}:${r.line}  ${r.content.slice(0, 120)}`);
      }
      if (results.length > 40) lines.push(`  ... and ${results.length - 40} more`);
      return lines.join('\n');
    },
  },
  {
    name: 'ListFiles',
    description:
      'List all files in the project with optional name filter. ' +
      'Faster than Glob for whole-project listings due to caching. ' +
      'Results exclude node_modules, .git, and build directories.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Optional: filter by filename substring' },
        rootDir: { type: 'string', description: 'Optional: root directory (default: project root)' },
      },
      required: [],
    },
    execute: async (args) => {
      const pattern = args['pattern'] ? String(args['pattern']) : undefined;
      const root = args['rootDir'] ? String(args['rootDir']) : process.cwd();
      const files = await listFiles(root, pattern);
      if (files.length === 0) return 'No files found.';
      const lines = [`Files (${files.length}):`, ''];
      for (const f of files.slice(0, 100)) lines.push(`  ${f}`);
      if (files.length > 100) lines.push(`  ... and ${files.length - 100} more`);
      return lines.join('\n');
    },
  },
];
