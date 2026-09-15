/**
 * Session and agent management commands: /clear, /tag, /rewind, /ctx_viz, /plan
 */
import type { CommandContext, DispatchResult } from './types.js';
import { config } from '../agent/config.js';

export function cmdClear(ctx: CommandContext): DispatchResult {
  ctx.agent.reset();
  ctx.ui.showSystemMessage('Conversation cleared. Starting fresh.');
  ctx.ui.promptUser();
  return { handled: true };
}

export function cmdRewind(ctx: CommandContext): DispatchResult {
  const ok = ctx.agent.restoreCheckpoint();
  console.log(ok ? '  Rewound to previous checkpoint.' : '  No checkpoints available.');
  ctx.ui.promptUser();
  return { handled: true };
}

export function cmdTag(ctx: CommandContext): DispatchResult {
  const idx = ctx.agent.saveCheckpoint();
  console.log(`  Checkpoint ${idx} saved. Use /rewind to return here.`);
  ctx.ui.promptUser();
  return { handled: true };
}

export function cmdCtxViz(ctx: CommandContext): DispatchResult {
  const usage = ctx.agent.getTokenUsage();
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const maxTokens = config.maxTokens;
  const barLen = 30;
  // For 1M context, scale the bar differently — use percentage of maxTokens
  const pct = Math.min(100, Math.round((totalTokens / maxTokens) * 100));
  const filled = Math.round((pct / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLen - filled));
  console.log(`  Context: ${bar} ${pct}%`);
  console.log(`  Used: ${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`);
  console.log(`  Messages in history: ${ctx.agent.exportMessages().length}`);
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdPlan(ctx: CommandContext): Promise<DispatchResult> {
  const { isPlanMode, setPlanMode } = await import('../tools/registry.js');
  if (isPlanMode()) {
    setPlanMode(false);
    console.log('  Planning mode deactivated.');
  } else {
    console.log('  Enter planning mode: the agent will plan before executing.');
    console.log('  Use EnterPlanMode tool in conversation, or /plan again to exit.');
  }
  ctx.ui.promptUser();
  return { handled: true };
}
