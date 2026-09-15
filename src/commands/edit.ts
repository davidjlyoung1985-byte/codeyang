/**
 * Edit history commands: /undo, /redo
 */
import type { CommandContext, DispatchResult } from './types.js';
import { editHistory } from '../utils/editHistory.js';
import { writeFile } from 'node:fs/promises';

export async function cmdUndo(ctx: CommandContext): Promise<DispatchResult> {
  const entry = editHistory.undo();
  if (!entry) {
    console.log('  Nothing to undo.');
  } else {
    await writeFile(entry.filePath, entry.previousContent, 'utf-8');
    console.log(`  Undone edit to ${entry.filePath}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdRedo(ctx: CommandContext): Promise<DispatchResult> {
  const entry = editHistory.redo();
  if (!entry) {
    console.log('  Nothing to redo.');
  } else {
    await writeFile(entry.filePath, entry.previousContent, 'utf-8');
    console.log(`  Redone edit to ${entry.filePath}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}
