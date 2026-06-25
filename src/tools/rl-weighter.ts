/**
 * Tool-Augmented RL — adaptive tool selection weighting.
 *
 * Tracks per-tool success/failure statistics across sessions and
 * applies a Bayesian weighting to bias tool selection toward
 * historically successful alternatives.
 *
 * Core formula:
 *   weight(t) = successRate(t) + explorationBonus(t)
 *   where successRate = (successes + α) / (calls + α + β)
 *   and explorationBonus = C * sqrt(ln(total_calls) / calls(t))
 *
 * This is UCB1 (Upper Confidence Bound), balancing exploitation
 * (use what works) with exploration (try what hasn't been tried much).
 */

import { writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ── Data Structure ────────────────────────────────────────────────────

export interface ToolStats {
  /** Tool name (canonical) */
  name: string;
  /** Total calls */
  calls: number;
  /** Successful calls (no error returned) */
  successes: number;
  /** Total execution time in ms */
  totalMs: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Error messages (last 5, deduplicated) */
  recentErrors: string[];
}

interface RLData {
  version: number;
  tools: Record<string, ToolStats>;
  /** Total tool calls across all tools */
  totalCalls: number;
  /** Last update timestamp */
  updatedAt: number;
}

// ── Configuration ────────────────────────────────────────────────────

const DATA_FILE = join(homedir(), '.codeyang', 'rl-weights.json');
const ALPHA = 1.0; // Beta prior: alpha (success pseudo-count)
const BETA = 1.0; // Beta prior: beta (failure pseudo-count)
const EXPLORATION_C = 0.5; // UCB1 exploration constant
const MAX_ERRORS_PER_TOOL = 5;

// ── State ─────────────────────────────────────────────────────────────

let rlData: RLData = loadSync();

function loadSync(): RLData {
  try {
    // Dynamic import for ESM compatibility
    const fsModule = require_node_fs();
    if (fsModule.existsSync(DATA_FILE)) {
      const raw = fsModule.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as RLData;
      return {
        version: parsed.version || 0,
        tools: parsed.tools || {},
        totalCalls: parsed.totalCalls || 0,
        updatedAt: parsed.updatedAt || Date.now(),
      };
    }
  } catch {
    // File corrupt or missing — start fresh
  }
  return { version: 0, tools: {}, totalCalls: 0, updatedAt: Date.now() };
}

/** Lazily resolve fs for ESM compatibility */
let _fs: typeof import('fs') | null = null;
function require_node_fs(): typeof import('fs') {
  if (!_fs) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _fs = require('fs') as typeof import('fs');
  }
  return _fs;
}

async function persist(): Promise<void> {
  try {
    const dir = join(homedir(), '.codeyang');
    await mkdir(dir, { recursive: true });
    rlData.updatedAt = Date.now();
    rlData.version++;
    const tmp = `${DATA_FILE}.tmp.${randomUUID()}`;
    await writeFile(tmp, JSON.stringify(rlData, null, 2), 'utf-8');
    await rename(tmp, DATA_FILE);
  } catch {
    // Best-effort persistence
  }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Record a tool call outcome. Call this after each tool execution.
 */
export async function recordToolOutcome(
  name: string,
  success: boolean,
  durationMs: number,
  errorMessage?: string,
): Promise<void> {
  if (!rldata_loaded()) await ensureLoaded();

  const stats = rlData.tools[name] || {
    name,
    calls: 0,
    successes: 0,
    totalMs: 0,
    lastUsed: 0,
    recentErrors: [],
  };

  stats.calls++;
  if (success) stats.successes++;
  stats.totalMs += durationMs;
  stats.lastUsed = Date.now();

  if (!success && errorMessage) {
    stats.recentErrors.unshift(errorMessage.slice(0, 200));
    if (stats.recentErrors.length > MAX_ERRORS_PER_TOOL) {
      stats.recentErrors.pop();
    }
  }

  rlData.tools[name] = stats;
  rlData.totalCalls++;

  // Persist every 10 calls (debounced)
  if (rlData.totalCalls % 10 === 0) {
    await persist();
  }
}

/** Lazy load flag */
let _loaded = false;
async function ensureLoaded(): Promise<void> {
  if (!_loaded) {
    try {
      const { readFile: rf } = await import('node:fs/promises');
      const raw = await rf(DATA_FILE, 'utf-8');
      rlData = JSON.parse(raw);
    } catch {
      // File not found — use default
    }
    _loaded = true;
  }
}
function rldata_loaded(): boolean {
  return _loaded;
}

/**
 * Get the RL-weighted score for a tool (0-100).
 *
 * Formula:
 *   base = Bayesian success rate
 *   ucb = exploration bonus (UCB1)
 *   final = clamp(base * 100 + ucb * 20, 0, 100)
 */
export function getToolWeight(name: string): number {
  const stats = rlData.tools[name];
  if (!stats || stats.calls === 0) {
    // Unknown tool: give medium weight to encourage exploration
    return 50;
  }

  // Bayesian success rate: (successes + α) / (calls + α + β)
  const successRate = (stats.successes + ALPHA) / (stats.calls + ALPHA + BETA);

  // UCB1 exploration bonus
  const explorationBonus =
    rlData.totalCalls > 0 ? EXPLORATION_C * Math.sqrt(Math.log(rlData.totalCalls + 1) / (stats.calls + 1)) : 0;

  const weight = Math.round(Math.min(100, Math.max(0, successRate * 90 + explorationBonus * 20)));
  return weight;
}

/**
 * Get all tool weights for ranking.
 */
export function getAllToolWeights(): Array<{ name: string; weight: number; calls: number; successRate: number }> {
  const result: Array<{ name: string; weight: number; calls: number; successRate: number }> = [];

  for (const [name, stats] of Object.entries(rlData.tools)) {
    const sr = stats.calls > 0 ? stats.successes / stats.calls : 0.5;
    result.push({
      name,
      weight: getToolWeight(name),
      calls: stats.calls,
      successRate: Math.round(sr * 100) / 100,
    });
  }

  return result.sort((a, b) => b.weight - a.weight);
}

/**
 * Get the top-k tools for a given task type, weighted by RL.
 * If the query matches multiple tools, prefer the one with higher weight.
 */
export function rankToolsByRL(toolNames: string[]): string[] {
  const weighted = toolNames.map((name) => ({
    name,
    weight: getToolWeight(name),
  }));
  return weighted.sort((a, b) => b.weight - a.weight).map((t) => t.name);
}

/**
 * Suggest an alternative tool based on RL history.
 * If a tool has high failure rate, suggest the most successful alternative.
 */
export function suggestAlternative(failedTool: string, alternatives: string[]): string | null {
  const failedStats = rlData.tools[failedTool];
  if (!failedStats || failedStats.calls < 3) return null;
  const failureRate = 1 - failedStats.successes / failedStats.calls;
  if (failureRate < 0.3) return null; // Not failing enough to warrant a switch

  const ranked = rankToolsByRL(alternatives.filter((a) => a !== failedTool));
  return ranked.length > 0 ? ranked[0] : null;
}

/**
 * Get RL statistics summary text.
 */
export function getRLSummary(): string {
  const tools = Object.entries(rlData.tools);
  if (tools.length === 0) return 'No tool usage data yet.';

  const lines: string[] = [`Tool RL Statistics (${tools.length} tools, ${rlData.totalCalls} total calls):`, ''];

  for (const [name, stats] of tools.sort((a, b) => b[1].calls - a[1].calls).slice(0, 20)) {
    const sr = stats.calls > 0 ? ((stats.successes / stats.calls) * 100).toFixed(0) : '—';
    lines.push(`  ${name.padEnd(25)} ${String(stats.calls).padStart(5)} calls  ${sr.padStart(3)}% success`);
  }

  return lines.join('\n');
}

/**
 * Reset all RL data.
 */
export async function resetRLData(): Promise<void> {
  rlData = { version: 0, tools: {}, totalCalls: 0, updatedAt: Date.now() };
  await persist();
}

/**
 * Get RL configuration version (for cache invalidation).
 */
export function getRLVersion(): number {
  return rlData.version;
}
