/**
 * Reflexion system commands: /reflect
 */
import type { CommandContext, DispatchResult } from './types.js';
import picocolors from 'picocolors';

const c = picocolors;

export async function cmdReflect(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const parts = line.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  if (!subcommand || subcommand === 'status') {
    return await cmdReflectStatus(ctx);
  }

  if (subcommand === 'stats') {
    return cmdReflectStats(ctx);
  }

  if (subcommand === 'history') {
    const count = parseInt(parts[2]) || 10;
    return cmdReflectHistory(ctx, count);
  }

  if (subcommand === 'learned') {
    const count = parseInt(parts[2]) || 5;
    return await cmdReflectLearned(ctx, count);
  }

  if (subcommand === 'clear') {
    return cmdReflectClear(ctx);
  }

  if (subcommand === 'run') {
    return await cmdReflectRun(ctx);
  }

  if (subcommand === 'list') {
    return await cmdReflectList(ctx);
  }

  console.log(c.yellow('  Usage:'));
  console.log(c.gray('    /reflect              - Show recent executions and status (default)'));
  console.log(c.gray('    /reflect stats        - Show detailed statistics'));
  console.log(c.gray('    /reflect history [N]  - Show last N executions (default: 10)'));
  console.log(c.gray('    /reflect learned [N]  - Show learned patterns (default: 5)'));
  console.log(c.gray('    /reflect list         - List all saved reflections'));
  console.log(c.gray('    /reflect run          - Force reflection now'));
  console.log(c.gray('    /reflect clear        - Clear execution history'));
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdReflectStatus(ctx: CommandContext): Promise<DispatchResult> {
  const engine = ctx.agent.getReflexionEngine();
  const recent = engine.getRecentExecutions(5);

  console.log(c.bold('\n  🔄 Reflexion Status\n'));

  if (recent.length === 0) {
    console.log(c.gray('  No recent executions to reflect on.'));
  } else {
    console.log(c.gray(`  Recent executions (${recent.length}):\n`));
    for (const r of recent) {
      const icon = r.success ? c.green('✓') : c.red('✗');
      const errorInfo = r.errorMessage ? r.errorMessage.slice(0, 60) : 'OK';
      const toolName = r.toolCalls.map((tc) => tc.name).join(', ') || r.task;
      const duration = r.durationMs < 1000 ? `${r.durationMs}ms` : `${(r.durationMs / 1000).toFixed(1)}s`;
      console.log(`  ${icon} ${c.cyan(toolName)} ${c.gray(`(${duration})`)} — ${errorInfo}`);
    }

    const stats = engine.getStats();
    console.log(
      c.gray(`\n  Total executions: ${stats.total} | Success: ${stats.successful} | Failed: ${stats.failed}`),
    );
    console.log(
      c.gray(
        `  Success rate: ${(stats.successRate * 100).toFixed(1)}% | Avg duration: ${stats.avgDurationMs.toFixed(0)}ms`,
      ),
    );

    if (engine.shouldReflect()) {
      console.log(c.yellow('\n  ⚠️  Consecutive failures detected — reflection recommended'));
      console.log(c.gray('  Run /reflect run to trigger reflection'));
    } else {
      console.log(c.gray('\n  No consecutive failure threshold reached yet.'));
    }
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdReflectStats(ctx: CommandContext): DispatchResult {
  const engine = ctx.agent.getReflexionEngine();
  const stats = engine.getStats();

  console.log(c.bold('\n  📊 Reflexion Statistics\n'));
  console.log(c.gray(`  Total Executions:      ${stats.total}`));
  console.log(c.green(`  Successful:            ${stats.successful}`));
  console.log(c.red(`  Failed:                ${stats.failed}`));
  console.log(c.gray(`  Success Rate:          ${(stats.successRate * 100).toFixed(1)}%`));
  console.log(c.gray(`  Avg Duration:          ${stats.avgDurationMs.toFixed(0)}ms`));
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdReflectHistory(ctx: CommandContext, count: number): DispatchResult {
  const engine = ctx.agent.getReflexionEngine();
  const recent = engine.getRecentExecutions(count);

  console.log(c.bold(`\n  📜 Execution History (last ${count})\n`));

  if (recent.length === 0) {
    console.log(c.gray('  No executions yet.'));
  } else {
    for (let i = 0; i < recent.length; i++) {
      const r = recent[i];
      const icon = r.success ? c.green('✓') : c.red('✗');
      const toolName = r.toolCalls.map((tc) => tc.name).join(', ') || r.task;
      const duration = r.durationMs < 1000 ? `${r.durationMs}ms` : `${(r.durationMs / 1000).toFixed(1)}s`;
      console.log(`  ${i + 1}. ${icon} ${c.cyan(toolName)} ${c.gray(`(${duration})`)}`);
      if (!r.success && r.errorMessage) {
        console.log(c.gray(`     Error: ${r.errorMessage.slice(0, 80)}`));
      }
    }
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdReflectLearned(ctx: CommandContext, count: number): Promise<DispatchResult> {
  const engine = ctx.agent.getReflexionEngine();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let patterns: any;

  try {
    patterns = await engine.getLearnedPatterns(count);
  } catch {
    patterns = null;
  }

  console.log(c.bold(`\n  💡 Learned Patterns (top ${count})\n`));

  if (!patterns) {
    console.log(c.gray('  No learned patterns yet.'));
  } else if (typeof patterns === 'string') {
    if (patterns.trim() === '') {
      console.log(c.gray('  No learned patterns yet.'));
    } else {
      console.log(patterns);
    }
  } else if (Array.isArray(patterns) && patterns.length > 0) {
    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      console.log(`  ${i + 1}. ${c.cyan(p.pattern || 'Unknown')}`);
      if (p.context) console.log(c.gray(`     Context: ${p.context}`));
      if (p.strength !== undefined) console.log(c.gray(`     Strength: ${p.strength.toFixed(2)}\n`));
    }
  } else {
    console.log(c.gray('  No learned patterns yet.'));
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdReflectClear(ctx: CommandContext): DispatchResult {
  const engine = ctx.agent.getReflexionEngine();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (engine as any).clearExecutions === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (engine as any).clearExecutions();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } else if (typeof (engine as any).clearHistory === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (engine as any).clearHistory();
  }
  console.log(c.green('  ✓ Execution history cleared'));
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdReflectRun(ctx: CommandContext): Promise<DispatchResult> {
  const engine = ctx.agent.getReflexionEngine();

  console.log(c.yellow('  Running reflection...'));

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reflectMethod = (engine as any).reflect;
    if (typeof reflectMethod === 'function') {
      await reflectMethod.call(engine);
    }
    console.log(c.green('  ✓ Reflection completed'));
  } catch (err) {
    console.log(c.red(`  ✗ Reflection failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdReflectList(ctx: CommandContext): Promise<DispatchResult> {
  const engine = ctx.agent.getReflexionEngine();

  console.log(c.bold(`\n  📋 Saved Reflections\n`));

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listMethod = (engine as any).listReflections;
    if (typeof listMethod === 'function') {
      const reflections = await listMethod.call(engine);
      if (reflections && reflections.length > 0) {
        for (let i = 0; i < reflections.length; i++) {
          const r = reflections[i];
          console.log(`  ${i + 1}. ${c.cyan(r.id || 'Unknown')}`);
          if (r.timestamp) console.log(c.gray(`     Created: ${new Date(r.timestamp).toLocaleString()}`));
          if (r.insights) console.log(c.gray(`     Insights: ${r.insights.length}\n`));
        }
      } else {
        console.log(c.gray('  No saved reflections yet.'));
      }
    } else {
      console.log(c.gray('  Reflection listing not available.'));
    }
  } catch {
    console.log(c.gray('  No saved reflections yet.'));
  }

  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}
