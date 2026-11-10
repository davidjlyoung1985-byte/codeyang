/**
 * Edit history commands: /undo, /redo
 *
 * Both go through the unified snapshot layer (`utils/snapshot.ts`), which covers
 * Write, Edit, MultiEdit, Delete and Move, and persists across restarts.
 */
import type { CommandContext, DispatchResult } from './types.js';
import * as snapshot from '../utils/snapshot.js';

export async function cmdUndo(ctx: CommandContext): Promise<DispatchResult> {
  const result = await snapshot.undo();
  if (!result.ok) {
    console.log(`  ${result.message}`);
  } else {
    console.log(`  ${result.message}`);
    if (result.canRedo) console.log('  (use /redo to re-apply)');
  }
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdRedo(ctx: CommandContext): Promise<DispatchResult> {
  const result = await snapshot.redo();
  if (!result.ok) {
    console.log(`  ${result.message}`);
  } else {
    console.log(`  ${result.message}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

/** `/history` (aliased as `/rewind --list`): show recent undoable changes. */
export async function cmdHistory(ctx: CommandContext): Promise<DispatchResult> {
  const entries = await snapshot.listSnapshots(20);
  if (entries.length === 0) {
    console.log('  No snapshots recorded in this session.');
    ctx.ui.promptUser();
    return { handled: true };
  }

  console.log(`\n  Recent changes (newest last, ${entries.length} shown):`);
  for (const e of entries) {
    const time = new Date(e.timestamp).toLocaleTimeString();
    const target = e.kind === 'move' ? `${e.path} -> ${e.moveTo ?? ''}` : e.path;
    const note = !e.backupPath && e.kind !== 'move' ? '  (not restorable)' : '';
    console.log(`  ${time}  ${e.tool.padEnd(9)} ${target}${note}`);
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}
