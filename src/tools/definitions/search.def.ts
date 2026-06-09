import type { ToolDefinition } from '../../types.js';
import { executeSearch } from '../SearchTool.js';
import { requiredString, optionalString, optionalNumber, optionalBoolean } from '../validate.js';

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
      const query = requiredString(args, 'query');
      const rootDir = optionalString(args, 'rootDir');
      const maxResults = optionalNumber(args, 'maxResults');
      const includeGlob = optionalString(args, 'includeGlob');
      const searchContent = optionalBoolean(args, 'searchContent', true) ?? true;
      const searchNames = optionalBoolean(args, 'searchNames', true) ?? true;
      const caseSensitive = optionalBoolean(args, 'caseSensitive', false) ?? false;
      return executeSearch(query, rootDir, {
        maxResults,
        includeGlob,
        searchContent,
        searchNames,
        caseSensitive,
      });
    },
  },
];
