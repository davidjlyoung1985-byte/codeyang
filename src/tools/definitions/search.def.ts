import type { ToolDefinition } from '../../types.js';
import { executeSearch } from '../SearchTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'Search',
    description:
      'Search for files by name and/or content in a directory. Returns ranked results: file name matches first, then content matches with line numbers. Faster than running Glob + Grep separately.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (regex supported)' },
        rootDir: { type: 'string', description: 'Root directory to search (default: cwd)' },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 20)' },
        includeGlob: { type: 'string', description: 'File glob filter e.g. "*.ts" (optional)' },
        searchContent: { type: 'boolean', description: 'Search file contents (default: true)' },
        searchNames: { type: 'boolean', description: 'Search file names (default: true)' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive search (default: false)' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '');
      const rootDir = args['rootDir'] ? String(args['rootDir']) : undefined;
      return executeSearch(query, rootDir, {
        maxResults: args['maxResults'] !== undefined ? Number(args['maxResults']) : undefined,
        includeGlob: args['includeGlob'] ? String(args['includeGlob']) : undefined,
        searchContent: args['searchContent'] !== false,
        searchNames: args['searchNames'] !== false,
        caseSensitive: args['caseSensitive'] === true,
      });
    },
  },
];
