/**
 * Harness system commands: /harness
 */
import type { CommandContext, DispatchResult } from './types.js';

export function cmdHarness(ctx: CommandContext): DispatchResult {
  const harness = ctx.agent.getHarnessStatus();
  const cbStats = harness.circuitBreakers as Array<{
    name: string;
    state: string;
    failureRate: number;
    totalCalls: number;
    openCount: number;
    isDegraded: boolean;
  }>;

  console.log(`\n  ┌─ Harness System Status ───────────────────────────`);
  console.log(`  │`);
  console.log(`  │ Tracing:`);
  console.log(`  │   Enabled:              ${(harness.tracing as Record<string, unknown>).enabled ? '✓' : '✗'}`);
  console.log(`  │   Recent Traces:        ${(harness.tracing as Record<string, unknown>).recentTraces}`);
  console.log(`  │   Total Spans:          ${(harness.tracing as Record<string, unknown>).totalSpans}`);
  console.log(`  │`);
  console.log(`  │ Circuit Breakers:`);
  for (const cb of cbStats) {
    const stateIcon = cb.state === 'CLOSED' ? '✓' : cb.state === 'OPEN' ? '✗' : '⚠';
    const degradeStr = cb.isDegraded ? ' [DEGRADED]' : '';
    console.log(
      `  │   ${stateIcon} ${cb.name.padEnd(16)} ${cb.state.padEnd(10)} calls:${String(cb.totalCalls).padEnd(6)} failRate:${(cb.failureRate * 100).toFixed(0)}% open:${cb.openCount}${degradeStr}`,
    );
  }
  console.log(`  │`);
  console.log(`  │ Gateway Operations:`);
  const ops = harness.gateway as Record<string, unknown>;
  console.log(`  │   Total Requests:      ${ops.totalRequests}`);
  console.log(`  │   Unique Operations:   ${ops.operations}`);
  console.log(`  │`);
  console.log(`  └──────────────────────────────────────────────────┘\n`);
  ctx.ui.promptUser();
  return { handled: true };
}
