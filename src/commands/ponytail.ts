/**
 * Ponytail methodology commands: /ponytail
 */
import type { CommandContext, DispatchResult } from './types.js';
import { config } from '../agent/config.js';
import { getPonytailPrompt } from '../agent/ponytail-prompt.js';
import type { PonytailLevel } from '../agent/ponytail-prompt.js';

export function cmdPonytail(line: string, ctx: CommandContext): DispatchResult {
  const arg = line.slice(10).trim().toLowerCase();
  const current = config.ponytailLevel;

  if (!arg || arg === 'status') {
    const modeLabels: Record<string, string> = { off: '✗ OFF', lite: '◇ LITE', full: '● FULL', ultra: '◆ ULTRA' };
    console.log(`\n  Ponytail Mode: ${modeLabels[current] || current}`);
    console.log(`  Toggle with: /ponytail lite | full | ultra | off`);
    console.log(`  Or set PONYTAIL_MODE env var permanently.\n`);
    ctx.ui.promptUser();
    return { handled: true };
  }

  if (arg === 'lite' || arg === 'full' || arg === 'ultra' || arg === 'off') {
    // Persist to env so next getSystemPrompt() picks it up
    process.env['PONYTAIL_MODE'] = arg;
    // Invalidate cached system prompt so it rebuilds with new mode
    ctx.agent.reset();
    ctx.agent.saveCheckpoint();
    const labels: Record<string, string> = { off: '✗ OFF', lite: '◇ LITE', full: '● FULL', ultra: '◆ ULTRA' };
    ctx.ui.showSystemMessage(`Ponytail mode → ${labels[arg]} (resets on restart)`);
    console.log(
      `  ${arg === 'off' ? 'Ponytail disabled.' : getPonytailPrompt(arg as PonytailLevel).slice(0, 120) + '...'}`,
    );
  } else {
    console.log(`  Usage: /ponytail [lite | full | ultra | off]\n  Current: ${current}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}
