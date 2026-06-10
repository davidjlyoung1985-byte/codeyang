import type { ToolDefinition } from '../../types.js';
import { executeEnterPlanMode } from '../EnterPlanModeTool.js';
import { executeExitPlanMode } from '../ExitPlanModeTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'EnterPlanMode',
    description:
      'Enter structured planning mode. In this mode, you must first write a step-by-step plan ' +
      'and wait for user approval before executing any changes. Use this for complex multi-step tasks.',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Optional goal description for the plan (optional)' },
      },
      required: [],
    },
    execute: async (args) => executeEnterPlanMode(args['goal'] ? String(args['goal']) : undefined),
  },
  {
    name: 'ExitPlanMode',
    description: 'Exit planning mode and return to normal execution. Call this after the plan is approved and executed.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async () => executeExitPlanMode(),
  },
];
