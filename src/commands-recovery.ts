/**
 * Recovery command implementation
 */
import type { CommandContext } from './commands.js';
import picocolors from 'picocolors';
const c = picocolors;

type DispatchResult = { handled: boolean; exit?: boolean };

/**
 * /recovery - Manage checkpoint recovery
 */
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

    if (checkpoints.length === 0) {
      console.log(c.gray('  No recoverable checkpoints found.'));
    } else {
      console.log(c.bold('\n  Available checkpoints:\n'));
      checkpoints.forEach((cp, i) => {
        const date = new Date(cp.timestamp).toLocaleString();
        const type = cp.recoveryMetadata.interruptionType || 'unknown';
        console.log(c.cyan(`  ${i + 1}. `) + c.white(cp.id) + c.gray(` (${date})`));
        console.log(c.gray(`     Session: ${cp.sessionId}, Turn: ${cp.turnIndex}, Type: ${type}`));
        console.log(c.gray(`     Tools: ${cp.toolExecutionState.completedTools.join(', ') || 'none'}`));
        console.log('');
      });
      console.log(c.gray('  Use /recovery restore <id> to restore a checkpoint'));
    }
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
      console.log(c.green(`✓ Restored from checkpoint: ${checkpointId}`));
      console.log(c.gray('  You can continue the conversation from where it was interrupted.'));
    } catch (error) {
      console.log(c.red(`✗ Failed to restore checkpoint: ${error instanceof Error ? error.message : String(error)}`));
    }
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /recovery save
  if (subcommand === 'save') {
    try {
      const checkpointId = await ctx.recoveryIntegration.createCheckpoint();
      console.log(c.green(`✓ Checkpoint saved: ${checkpointId}`));
    } catch (error) {
      console.log(c.red(`✗ Failed to save checkpoint: ${error instanceof Error ? error.message : String(error)}`));
    }
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /recovery status
  if (subcommand === 'status') {
    const sessionId = ctx.recoveryIntegration.getSessionId();
    console.log(c.bold('\n  Recovery System Status:\n'));
    console.log(c.gray(`  Current Session: ${sessionId}`));
    console.log(c.gray(`  Auto-checkpoint: enabled (every 30s)`));
    console.log(c.gray(`  Checkpoint directory: ~/.codeyang/checkpoints`));

    const checkpoints = await ctx.recoveryIntegration.listRecoverableCheckpoints();
    console.log(c.gray(`  Recoverable checkpoints: ${checkpoints.length}`));
    console.log('');
    ctx.ui.promptUser();
    return { handled: true };
  }

  // Unknown subcommand
  console.log(c.yellow('  Usage:'));
  console.log(c.gray('    /recovery list          - List all recoverable checkpoints'));
  console.log(c.gray('    /recovery restore <id>  - Restore from a checkpoint'));
  console.log(c.gray('    /recovery save          - Manually save a checkpoint'));
  console.log(c.gray('    /recovery status        - Show recovery system status'));
  ctx.ui.promptUser();
  return { handled: true };
}
