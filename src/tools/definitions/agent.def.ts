import type { ToolDefinition } from '../../types.js';
import { executeAgent, type AgentType } from '../AgentTool.js';

const AGENT_TYPE_DESC =
  'Agent type: "explore" (read-only investigation), "plan" (design solution), "execute" (implement changes)';

export const definitions: ToolDefinition[] = [
  {
    name: 'Agent',
    description:
      'Launch a specialized sub-agent to handle a task autonomously. ' +
      'Three agent types available:\n' +
      '- "explore" — read-only investigation, gathers information without making changes\n' +
      '- "plan" — designs a step-by-step solution based on exploration\n' +
      '- "execute" — implements the plan, writes code and files\n\n' +
      'Use the "memory" parameter to pass context from one agent to another. ' +
      'For complex tasks, chain agents: explore → plan → execute.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['explore', 'plan', 'execute'],
          description: AGENT_TYPE_DESC,
        },
        prompt: { type: 'string', description: 'The task to accomplish' },
        memory: { type: 'string', description: 'Context from previous agents (optional). Pass output of one agent as memory to the next.' },
        maxTurns: { type: 'number', description: 'Max execution turns (default: 15)' },
      },
      required: ['type', 'prompt'],
    },
    execute: async (args) => {
      const config = {
        type: String(args['type'] ?? 'execute') as AgentType,
        prompt: String(args['prompt'] ?? ''),
        memory: args['memory'] ? String(args['memory']) : undefined,
        maxTurns: args['maxTurns'] !== undefined ? Number(args['maxTurns']) : undefined,
      };
      return executeAgent(config);
    },
  },
];
