/**
 * Git-related commands: /diff, /commit, /branch
 */
import type { CommandContext, DispatchResult } from './types.js';
import { resolveCwd } from './types.js';

export async function cmdDiff(ctx: CommandContext): Promise<DispatchResult> {
  const { executeGitDiff } = await import('../tools/GitTool.js');
  const result = await executeGitDiff(resolveCwd(ctx), false, undefined);
  console.log(`\n${result}`);
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdCommit(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const msg = line.slice(8).trim();
  if (!msg) {
    console.log('  Usage: /commit <message>');
  } else {
    const { executeGitCommit } = await import('../tools/GitTool.js');
    const result = await executeGitCommit(msg, resolveCwd(ctx), true);
    console.log(`\n${result}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdBranch(ctx: CommandContext): Promise<DispatchResult> {
  const { executeGitBranch } = await import('../tools/GitTool.js');
  const result = await executeGitBranch(resolveCwd(ctx), false);
  console.log(`\n${result}`);
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdGenCommit(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const { executeGitDiff } = await import('../tools/GitTool.js');
  const diff = await executeGitDiff(resolveCwd(ctx), true, undefined);
  if (!diff.trim()) {
    console.log('  No changes to commit.');
    ctx.ui.promptUser();
    return { handled: true };
  }
  const maxLen = line.includes('--full') ? 50_000 : 8_000;
  const trimmed = diff.length > maxLen ? diff.slice(0, maxLen) + '\n[diff truncated]' : diff;
  const msg = `Generate a concise commit message for this diff:\n\n${trimmed}`;
  await ctx.agent.run(msg);
  return { handled: true };
}
