/**
 * Command handlers - re-export from modular structure
 *
 * This file has been refactored from 883 lines into modular components:
 * - commands/types.ts - Shared types and utilities
 * - commands/session.ts - Session management (/clear, /tag, /rewind, etc.)
 * - commands/info.ts - Information commands (/sessions, /tools, /stats)
 * - commands/git.ts - Git operations (/diff, /commit, /branch)
 * - commands/config.ts - Configuration (/model, /config, /reload, /mcp)
 * - commands/edit.ts - Edit history (/undo, /redo)
 * - commands/ponytail.ts - Ponytail methodology
 * - commands/quality.ts - Code quality (/review, /fix)
 * - commands/reflect.ts - Reflexion system
 * - commands/recovery.ts - Recovery management
 * - commands/harness.ts - Harness system status
 * - commands/matlab.ts - MATLAB integration
 */

export { dispatch } from './commands/index.js';
export type { CommandContext, DispatchResult } from './commands/types.js';
export { resolveCwd } from './commands/types.js';
