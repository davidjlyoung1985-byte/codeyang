/**
 * Main command dispatcher - delegates to modular command handlers
 */
import type { CommandContext, DispatchResult } from './types.js';
import { saveSession } from '../utils/sessionStore.js';

// Import command modules
import { cmdClear, cmdRewind, cmdTag, cmdCtxViz, cmdPlan } from './session.js';
import { cmdSessions, cmdTools, cmdStats, cmdTasks, cmdStatus } from './info.js';
import { cmdDiff, cmdCommit, cmdBranch, cmdGenCommit } from './git.js';
import { cmdModel, cmdConfig, cmdReload, cmdMcp } from './config.js';
import { cmdUndo, cmdRedo } from './edit.js';
import { cmdPonytail } from './ponytail.js';
import { cmdReview, cmdFix } from './quality.js';

export type { CommandContext, DispatchResult } from './types.js';
export { resolveCwd } from './types.js';

export async function dispatch(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const lower = line.toLowerCase().trim();

  // Exit commands
  if (['exit', 'quit', '/exit', '/quit'].includes(lower)) {
    try {
      await saveSession(ctx.agent.exportMessages(), ctx.currentSessionId);
    } catch {
      // Ignore save failures on exit
    }
    await ctx.mcpMgr.shutdown();
    ctx.ui.close();
    process.exit(0);
  }

  // Session management
  if (lower === '/clear') return cmdClear(ctx);
  if (lower === '/rewind') return cmdRewind(ctx);
  if (lower === '/tag') return cmdTag(ctx);
  if (lower === '/ctx_viz' || lower === '/context') return cmdCtxViz(ctx);
  if (lower === '/plan') return await cmdPlan(ctx);

  // Information
  if (lower === '/sessions') return await cmdSessions(ctx);
  if (lower === '/tools') return await cmdTools(ctx);
  if (lower === '/stats') return cmdStats(ctx);
  if (lower === '/tasks') return await cmdTasks(ctx);
  if (lower === '/status') return cmdStatus(ctx);

  // Git operations
  if (lower === '/diff') return await cmdDiff(ctx);
  if (lower.startsWith('/commit')) return await cmdCommit(line, ctx);
  if (lower === '/branch') return await cmdBranch(ctx);
  if (lower.startsWith('/gen-commit')) return await cmdGenCommit(line, ctx);

  // Configuration
  if (lower.startsWith('/model')) return cmdModel(line, ctx);
  if (lower === '/config') return cmdConfig(ctx);
  if (lower === '/reload') return await cmdReload(ctx);
  if (lower === '/mcp') return cmdMcp(ctx);

  // Edit history
  if (lower === '/undo') return await cmdUndo(ctx);
  if (lower === '/redo') return await cmdRedo(ctx);

  // Features
  if (lower.startsWith('/ponytail')) return cmdPonytail(line, ctx);
  if (lower.startsWith('/review')) return await cmdReview(line, ctx);
  if (lower === '/fix') return await cmdFix(ctx);

  // Advanced features (imported dynamically)
  if (lower.startsWith('/reflect')) {
    const { cmdReflect } = await import('./reflect.js');
    return await cmdReflect(line, ctx);
  }
  if (lower === '/harness') {
    const { cmdHarness } = await import('./harness.js');
    return cmdHarness(ctx);
  }
  if (lower === '/matlab') {
    const { cmdMatlab } = await import('./matlab.js');
    return await cmdMatlab(ctx);
  }
  if (lower.startsWith('/recovery')) {
    const { cmdRecovery } = await import('./recovery.js');
    return await cmdRecovery(line, ctx);
  }

  // Unknown command
  if (lower.startsWith('/')) {
    const validCommands = [
      '/clear',
      '/sessions',
      '/tools',
      '/model',
      '/ponytail',
      '/mcp',
      '/stats',
      '/status',
      '/reflect',
      '/review',
      '/fix',
      '/gen-commit',
      '/config',
      '/diff',
      '/commit',
      '/undo',
      '/redo',
      '/branch',
      '/ctx_viz',
      '/rewind',
      '/tag',
      '/plan',
      '/tasks',
      '/reload',
      '/harness',
      '/matlab',
      '/recovery',
    ];
    console.log(`Unknown command: ${line}`);
    console.log(`Available: ${validCommands.join(', ')}`);
    ctx.ui.promptUser();
    return { handled: true };
  }

  return { handled: false };
}
