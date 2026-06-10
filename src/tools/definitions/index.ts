import type { ToolDefinition } from '../../types.js';
import { definitions as coreDefs } from './core.def.js';
import { definitions as filesystemDefs } from './filesystem.def.js';
import { definitions as dataDefs } from './data.def.js';
import { definitions as gitDefs } from './git.def.js';
import { definitions as codeDefs } from './code.def.js';
import { definitions as networkDefs } from './network.def.js';
import { definitions as memoryDefs } from './memory.def.js';
import { definitions as imageDefs } from './image.def.js';
import { definitions as mathDefs } from './math.def.js';
import { definitions as searchDefs } from './search.def.js';
import { definitions as githubDefs } from './github.def.js';
import { refactorToolDefinitions } from './refactor.def.js';

/** All built-in tool definitions organized by category. */
export const builtinDefinitions: ToolDefinition[] = [
  ...coreDefs,
  ...filesystemDefs,
  ...dataDefs,
  ...gitDefs,
  ...codeDefs,
  ...networkDefs,
  ...memoryDefs,
  ...imageDefs,
  ...searchDefs,
  ...githubDefs,
  ...refactorToolDefinitions,
];

/** Math tool definitions (registered dynamically via registerMathTools). */
export { definitions as mathDefs } from './math.def.js';
