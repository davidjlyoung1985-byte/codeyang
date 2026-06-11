import type { ToolDefinition } from '../../types.js';
import { executeWebSearch } from '../WebSearchTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'WebSearch',
    description:
      'Search the web for current information. Returns ranked results with title, URL, and snippet. ' +
      'Use when you need up-to-date information, documentation, or facts beyond your training data. ' +
      'Free by default (DuckDuckGo). Also supports SearXNG, SerpAPI, Bing, and Google backends. ' +
      'Configure via CODEYANG_SEARCH_API env var.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keywords or natural language question)' },
        topK: { type: 'number', description: 'Number of results to return (default: 5, max: 20)' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '');
      const topK = Math.min(Number(args['topK'] ?? 5), 20);
      return executeWebSearch(query, topK);
    },
  },
];
