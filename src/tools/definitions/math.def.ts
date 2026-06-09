import type { ToolDefinition } from '../../types.js';
import { executeMathSolve } from '../../math/MathSolve.js';
import { executeMathPlot } from '../../math/MathPlot.js';
import { executeMathExplain } from '../../math/MathExplain.js';
import { requiredString, optionalString } from '../validate.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'MathSolve',
    description:
      'Solve middle school math problems step by step with Chinese explanations. ' +
      'Covers: linear equations (一元一次方程), quadratic equations (一元二次方程), ' +
      'systems of equations (二元一次方程组), Pythagorean theorem (勾股定理), ' +
      'circle geometry (圆), statistics (统计), and percentages (百分比).',
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
      const problem = requiredString(args, 'problem');
      const type = optionalString(args, 'type');
      return executeMathSolve(problem, type);
    },
  },
  {
    name: 'MathPlot',
    description:
      'Generate SVG mathematical diagrams. Supports: coordinate plane (坐标系), ' +
      'function graphs (函数图像, e.g. func:x*2+1), triangle (三角形 with labels), ' +
      'bar charts (条形统计图 e.g. bar:A=5,B=8). Outputs SVG files viewable in browser.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Plot kind: coordinate, func:<expr>, triangle, bar:<data>' },
        output: { type: 'string', description: 'Output filename (default: auto-named .svg in project root)' },
      },
      required: ['kind'],
    },
    execute: async (args) => {
      const kind = requiredString(args, 'kind');
      const output = optionalString(args, 'output');
      return executeMathPlot(kind, output);
    },
  },
  {
    name: 'MathExplain',
    description:
      'Reference for middle school math concepts with formulas, examples, and common mistakes. ' +
      'Topics: linear equations (一元一次方程), quadratic equations (一元二次方程), ' +
      'Pythagorean theorem (勾股定理), linear functions (一次函数), ' +
      'quadratic functions (二次函数), circles (圆), statistics (统计), probability (概率).',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic name (Chinese or English). Leave empty to list all topics.' },
      },
      required: [],
    },
    execute: async (args) => {
      const topic = optionalString(args, 'topic');
      return executeMathExplain(topic);
    },
  },
];
