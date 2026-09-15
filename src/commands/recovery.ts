/**
 * Recovery system commands: /recovery
 */
import type { CommandContext, DispatchResult } from './types.js';
import picocolors from 'picocolors';

const c = picocolors;

export async function cmdRecovery(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const parts = line.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  if (!ctx.recoveryIntegration) {
    console.log(c.yellow('  Recovery system is not initialized.'));
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /recovery list
  if (!subcommand || subcommand === 'list') {
    const checkpoints = await ctx.recoveryIntegration.listRecoverableCheckpoints();
    console.log(c.bold(`\n  💾 Available Checkpoints (${checkpoints.length})\n`));
    if (checkpoints.length === 0) {
      console.log(c.gray('  No checkpoints available for recovery.'));
    } else {
      for (const cp of checkpoints) {
        console.log(`  ${c.cyan(cp.id)} - ${new Date(cp.timestamp).toLocaleString()}`);
        console.log(c.gray(`    State saved at checkpoint`));
      }
    }
    console.log('');
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /recovery restore <id>
  if (subcommand === 'restore') {
    const checkpointId = parts[2];
    if (!checkpointId) {
      console.log(c.yellow('  Usage: /recovery restore <checkpoint-id>'));
      ctx.ui.promptUser();
      return { handled: true };
    }

    try {
      await ctx.recoveryIntegration.restoreFromCheckpoint(checkpointId);
      console.log(c.green(`  ✓ Restored from checkpoint: ${checkpointId}`));
    } catch (err) {
      console.log(c.red(`  ✗ Failed to restore: ${err instanceof Error ? err.message : String(err)}`));
    }
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /recovery save
  if (subcommand === 'save') {
    try {
      const checkpointId = await ctx.recoveryIntegration.createCheckpoint();
      console.log(c.green(`  ✓ Checkpoint saved: ${checkpointId}`));
    } catch (err) {
      console.log(c.red(`  ✗ Failed to save: ${err instanceof Error ? err.message : String(err)}`));
    }
    ctx.ui.promptUser();
    return { handled: true };
  }

  // Unknown subcommand
  console.log(c.yellow('  Usage:'));
  console.log(c.gray('    /recovery              - List available checkpoints'));
  console.log(c.gray('    /recovery list         - List available checkpoints'));
  console.log(c.gray('    /recovery save         - Create a new checkpoint'));
  console.log(c.gray('    /recovery restore <id> - Restore from a checkpoint'));
  ctx.ui.promptUser();
  return { handled: true };
}
