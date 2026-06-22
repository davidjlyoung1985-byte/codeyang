/**
 * Math tool factory — creates ToolDefinition[] for registration.
 * Conditionally called when math tools are enabled.
 */
/* eslint-disable @typescript-eslint/require-await -- ToolDefinition interface requires async execute methods */
import type { ToolDefinition } from '../types.js';
import { executeMathSolve } from './MathSolve.js';
import { executeMathPlot } from './MathPlot.js';
import { executeMathExplain } from './MathExplain.js';

export function createMathTools(): ToolDefinition[] {
  return [
    {
      name: 'MathSolve',
      description:
        'Solve middle school math problems step by step with Chinese explanations. ' +
        'Covers: linear equations, quadratic equations, systems of equations, ' +
        'Pythagorean theorem, circle geometry, statistics, and percentages.',
      parameters: {
        type: 'object',
        properties: {
          problem: { type: 'string', description: 'The math problem to solve' },
          type: {
            type: 'string',
            enum: ['linear', 'quadratic', 'system', 'pythagorean', 'circle', 'stats', 'percent'],
            description: 'Problem type (auto-detected if not specified)',
          },
        },
        required: ['problem'],
      },
      execute: async (args) => {
        const problem = String(args['problem'] ?? '');
        const type = args['type'] ? String(args['type']) : undefined;
        return executeMathSolve(problem, type);
      },
    },
    {
      name: 'MathPlot',
      description:
        'Generate SVG mathematical diagrams. Supports: coordinate plane, ' +
        'function graphs (e.g. func:x*2+1), triangle with labels), ' +
        'bar charts (e.g. bar:A=5,B=8). Outputs SVG files.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'Plot kind: coordinate, func:<expr>, triangle, bar:<data>' },
          output: { type: 'string', description: 'Output filename (default: auto-named .svg)' },
        },
        required: ['kind'],
      },
      execute: async (args) => {
        const kind = String(args['kind'] ?? '');
        const output = args['output'] ? String(args['output']) : undefined;
        return executeMathPlot(kind, output);
      },
    },
    {
      name: 'MathExplain',
      description:
        'Reference for middle school math concepts with formulas, examples, and common mistakes. ' +
        'Topics: linear equations, quadratic equations, Pythagorean theorem, ' +
        'linear functions, quadratic functions, circles, statistics, probability.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic name (Chinese or English). Leave empty to list all topics.' },
        },
        required: [],
      },
      execute: async (args) => {
        const topic = args['topic'] ? String(args['topic']) : undefined;
        return executeMathExplain(topic);
      },
    },
  ];
}
