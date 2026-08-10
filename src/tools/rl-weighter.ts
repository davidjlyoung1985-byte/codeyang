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
 *
 * All I/O is async. On module load, data starts as an in-memory default;
 * the first call to any API triggers lazy async load from disk.
 * If the file doesn't exist or is corrupt, we silently use defaults.
 * This avoids synchronous `require('fs')` hacks that break ESM.
 */

import { writeFile, mkdir, rename, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { codeyangPath, getCodeyangHome } from '../utils/paths.js';

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

const DATA_FILE = codeyangPath('rl-weights.json');
const ALPHA = 1.0; // Beta prior: alpha (success pseudo-count)
const BETA = 1.0; // Beta prior: beta (failure pseudo-count)
const EXPLORATION_C = 0.5; // UCB1 exploration constant
const MAX_ERRORS_PER_TOOL = 5;
const PERSIST_INTERVAL = 5; // Persist every N calls

// ── State ─────────────────────────────────────────────────────────────

/** In-memory RL data — starts as default, lazy-loaded from disk on first use. */
let rlData: RLData = {
  version: 0,
  tools: {},
  totalCalls: 0,
  updatedAt: Date.now(),
};

/** Whether the async load from disk has completed (or failed). */
let loadAttempted = false;
/** Guards against concurrent loads. */
let loadPromise: Promise<void> | null = null;

// ── Lazy async loader ─────────────────────────────────────────────────

/**
 * Ensures RL data is loaded from disk at least once.
 * Safe to call multiple times — only the first call reads the file.
 * Falls back to default in-memory data if the file is missing/corrupt.
 */
async function ensureLoaded(): Promise<void> {
  if (loadAttempted) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const raw = await readFile(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as RLData;
      rlData = {
        version: parsed.version || 0,
        tools: parsed.tools || {},
        totalCalls: parsed.totalCalls || 0,
        updatedAt: parsed.updatedAt || Date.now(),
      };
    } catch {
      // File missing or corrupt — stay with default in-memory data
    }
    loadAttempted = true;
  })();

  return loadPromise;
}

async function persist(): Promise<void> {
  try {
    const dir = getCodeyangHome();
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
 * Automatically loads data from disk on first call.
 */
export async function recordToolOutcome(
  name: string,
  success: boolean,
  durationMs: number,
  errorMessage?: string,
): Promise<void> {
  await ensureLoaded();

  const stats = rlData.tools[name] ?? {
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

  // Debounced persist
  if (rlData.totalCalls % PERSIST_INTERVAL === 0) {
    await persist();
  }
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

  // Unknown tool: medium weight to encourage exploration
  if (!stats || stats.calls === 0) return 50;

  // Bayesian success rate: (successes + α) / (calls + α + β)
  const successRate = (stats.successes + ALPHA) / (stats.calls + ALPHA + BETA);

  // UCB1 exploration bonus
  const explorationBonus =
    rlData.totalCalls > 0 ? EXPLORATION_C * Math.sqrt(Math.log(rlData.totalCalls + 1) / (stats.calls + 1)) : 0;

  return Math.round(Math.min(100, Math.max(0, successRate * 90 + explorationBonus * 20)));
}

/**
 * Get all tool weights for ranking.
 */
export function getAllToolWeights(): Array<{ name: string; weight: number; calls: number; successRate: number }> {
  return Object.entries(rlData.tools)
    .map(([name, stats]) => ({
      name,
      weight: getToolWeight(name),
      calls: stats.calls,
      successRate: stats.calls > 0 ? Math.round((stats.successes / stats.calls) * 100) / 100 : 0.5,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Rank tool names by RL weight (highest first).
 */
export function rankToolsByRL(toolNames: string[]): string[] {
  return [...toolNames]
    .map((name) => ({ name, weight: getToolWeight(name) }))
    .sort((a, b) => b.weight - a.weight)
    .map((t) => t.name);
}

/**
 * Suggest an alternative tool based on RL history.
 * If a tool has high failure rate (>=30%), suggest the most successful alternative.
 * Returns null if the tool hasn't failed enough or no suitable alternative found.
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
 * Apply temporal decay to RL data.
 * Older data points are weighted less than recent ones using exponential decay.
 *
 * Formula for decayed success rate:
 *   effective(start) + Σ(decayFactor^(now - t_i) * outcome_i)
 *
 * This prevents ancient history from biasing current tool selection.
 */
export async function applyDecay(halflifeDays = 30): Promise<number> {
  await ensureLoaded();
  const now = Date.now();
  const halfLifeMs = halflifeDays * 24 * 60 * 60 * 1000;
  const decayLambda = Math.LN2 / halfLifeMs;
  let decayed = 0;

  for (const stats of Object.values(rlData.tools)) {
    if (stats.calls === 0) continue;
    const age = now - stats.lastUsed;
    if (age <= halfLifeMs) continue; // Still within half-life, keep as-is

    // Apply decay: simulate the effect of age by gradually reducing success count
    const decayFactor = Math.exp(-decayLambda * age);
    const effectiveCalls = Math.max(1, Math.round(stats.calls * decayFactor));
    const effectiveSuccesses = Math.round(stats.successes * decayFactor);

    // Only decay if it meaningfully changes the stats
    const callReduction = stats.calls - effectiveCalls;
    if (callReduction > 3) {
      stats.calls = effectiveCalls;
      stats.successes = effectiveSuccesses;
      decayed++;
    }
  }

  if (decayed > 0) {
    rlData.updatedAt = Date.now();
    await persist();
  }

  return decayed;
}

/**
 * Get RL statistics summary text.
 */
export function getRLSummary(): string {
  const entries = Object.entries(rlData.tools);
  if (entries.length === 0) return 'No tool usage data yet.';

  const lines = [`Tool RL Statistics (${entries.length} tools, ${rlData.totalCalls} total calls):`, ''];
  for (const [name, stats] of entries.sort((a, b) => b[1].calls - a[1].calls).slice(0, 20)) {
    const sr = stats.calls > 0 ? `${((stats.successes / stats.calls) * 100).toFixed(0)}%` : '—';
    lines.push(`  ${name.padEnd(25)} ${String(stats.calls).padStart(5)} calls  ${sr.padStart(4)} success`);
  }
  return lines.join('\n');
}

/**
 * Export RL data as a portable JSON string.
 * Useful for sharing learning across different machines or backing up.
 */
export async function exportRLData(): Promise<string> {
  await ensureLoaded();
  return JSON.stringify(
    {
      version: rlData.version,
      tools: rlData.tools,
      totalCalls: rlData.totalCalls,
      exportedAt: Date.now(),
    },
    null,
    2,
  );
}

/**
 * Import RL data from a JSON string.
 * Merges with existing data — if a tool already exists, the higher-call-count
 * version wins (to prevent stale data from overwriting fresh data).
 */
export async function importRLData(json: string): Promise<{ merged: number; skipped: number }> {
  await ensureLoaded();
  let merged = 0;
  let skipped = 0;

  try {
    const imported = JSON.parse(json) as {
      tools?: Record<string, ToolStats>;
      totalCalls?: number;
    };

    if (!imported.tools || typeof imported.tools !== 'object') {
      return { merged: 0, skipped: 0 };
    }

    for (const [name, importedStats] of Object.entries(imported.tools)) {
      if (!importedStats || typeof importedStats.calls !== 'number') continue;

      const existing = rlData.tools[name];
      if (!existing || importedStats.calls > existing.calls) {
        // Import wins: has more data than we have
        rlData.tools[name] = { ...importedStats };
        merged++;
      } else if (importedStats.calls === existing.calls) {
        // Equal: merge by averaging success rate
        const avgSuccesses = Math.round((importedStats.successes + existing.successes) / 2);
        const avgCalls = Math.max(importedStats.calls, existing.calls);
        existing.successes = Math.max(existing.successes, avgSuccesses);
        existing.calls = Math.max(existing.calls, avgCalls);
        merged++;
      } else {
        // Our data is more recent — skip
        skipped++;
      }
    }

    if (imported.totalCalls && imported.totalCalls > rlData.totalCalls) {
      rlData.totalCalls = imported.totalCalls;
    }

    if (merged > 0) {
      await persist();
    }
  } catch {
    // Invalid JSON — nothing imported
  }

  return { merged, skipped };
}

/**
 * Force-persist RL data to disk immediately.
 * Call this on process exit/session save to ensure no data loss.
 */
export async function flushRLData(): Promise<void> {
  await ensureLoaded();
  await persist();
}

/**
 * Reset all RL data (async — call and await).
 */
export async function resetRLData(): Promise<void> {
  rlData = { version: 0, tools: {}, totalCalls: 0, updatedAt: Date.now() };
  await persist();
}

/**
 * Get RL data version (for cache invalidation in AgentContextManager).
 * Increments on every persist.
 */
export function getRLVersion(): number {
  return rlData.version;
}
