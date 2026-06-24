/**
 * Continual Learning — intelligent memory management.
 *
 * Extends the basic memoryStore with:
 * 1. **Auto-classification**: Automatically categorizes memories by content analysis
 * 2. **Auto-compression**: Merges related memories into summaries
 * 3. **Auto-forgetting**: Removes stale/low-value memories based on access patterns
 * 4. **Memory consolidation**: Periodically consolidates fragmented memories
 *
 * This runs as a background process triggered by memory operations.
 */

import {
  saveMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  getMemoryCount,
  getMemorySummary,
  type Memory,
} from '../utils/memoryStore.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface ConsolidationReport {
  classified: number;
  compressed: number;
  forgotten: number;
  consolidated: number;
  totalBefore: number;
  totalAfter: number;
}

interface MemoryAccess {
  id: string;
  lastAccess: number;
  accessCount: number;
}

// ── State ─────────────────────────────────────────────────────────────

const ACCESS_LOG = new Map<string, MemoryAccess>();

// Classification keywords
const CLASSIFICATION_RULES: Array<{ type: Memory['type']; patterns: RegExp[] }> = [
  {
    type: 'instruction',
    patterns: [
      /always|never|must|should|prefer|use\s+\w+\s+for/i,
      /rule|guideline|convention|policy/i,
      /how\s+to|way\s+to|approach/i,
    ],
  },
  {
    type: 'preference',
    patterns: [
      /i\s+like|i\s+prefer|i\s+want|i'd\s+like|favorite|preference/i,
      /color|theme|font|size|layout|style/i,
      /shortcut|key|hotkey/i,
    ],
  },
  {
    type: 'project',
    patterns: [
      /project|repo|repository|workspace|app\s+name/i,
      /located\s+at|path:|directory:|folder:/i,
      /dependency|package|module|library|version/i,
    ],
  },
  {
    type: 'context',
    patterns: [
      /currently|ongoing|in\s+progress|working\s+on|status|phase/i,
      /last|saved|checkpoint|session/i,
      /context|background|history/i,
    ],
  },
  {
    type: 'fact',
    patterns: [/.{10,}/], // catch-all for anything at least 10 chars
  },
];

// ── Public API ────────────────────────────────────────────────────────

/**
 * Track memory access for consolidation decisions.
 */
export function trackAccess(id: string): void {
  const existing = ACCESS_LOG.get(id);
  if (existing) {
    existing.lastAccess = Date.now();
    existing.accessCount++;
  } else {
    ACCESS_LOG.set(id, { id, lastAccess: Date.now(), accessCount: 1 });
  }

  // Periodically trim the access log
  if (ACCESS_LOG.size > 1000) {
    const sorted = [...ACCESS_LOG.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    const toDelete = sorted.slice(0, sorted.length - 500);
    for (const [id] of toDelete) {
      ACCESS_LOG.delete(id);
    }
  }
}

/**
 * Auto-classify a memory based on its content.
 * Returns the best-matching type.
 */
export function autoClassify(key: string, value: string): Memory['type'] {
  const combined = `${key} ${value}`;

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combined)) {
        return rule.type;
      }
    }
  }

  return 'fact'; // Default
}

/**
 * Find duplicate or highly similar memories that can be compressed.
 */
export async function findCompressibleMemories(): Promise<
  Array<{ ids: string[]; mergedKey: string; mergedValue: string; type: Memory['type'] }>
> {
  const all = await listMemories();

  // Group by type + key similarity (prefix match)
  const groups = new Map<string, Memory[]>();

  for (const mem of all) {
    // Use first 20 chars of key as group identifier
    const groupKey = `${mem.type}:${mem.key.slice(0, 20)}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(mem);
  }

  const compressible: Array<{ ids: string[]; mergedKey: string; mergedValue: string; type: Memory['type'] }> = [];

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Check if values are similar enough to merge
    const sorted = group.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const ids = sorted.map((m) => m.id);

    // Merge: use latest key, concatenate unique values
    const mergedKey = sorted[0].key;
    const existing = new Set<string>();
    const mergedValue = sorted
      .map((m) => {
        const val = m.value.trim();
        if (existing.has(val) || val.length < 5) return null;
        existing.add(val);
        return val;
      })
      .filter(Boolean) as string[];

    if (mergedValue.length <= 1) continue; // Nothing to compress

    // Only compress if the merged result is not much longer than originals
    const originalTotal = group.reduce((sum, m) => sum + m.value.length, 0);
    const mergedLength = mergedValue.join('; ').length;
    if (mergedLength < originalTotal * 1.5) {
      // Meaningful compression
      compressible.push({
        ids,
        mergedKey,
        mergedValue: mergedValue.join('; '),
        type: sorted[0].type,
      });
    }
  }

  return compressible;
}

/**
 * Compress similar memories by merging them.
 */
export async function compressMemories(): Promise<number> {
  const candidates = await findCompressibleMemories();
  let compressed = 0;

  for (const c of candidates) {
    try {
      // Save merged memory
      const merged = await saveMemory(c.mergedKey, c.mergedValue, c.type);

      // Delete originals (except the one that became the merged record)
      for (const id of c.ids) {
        if (id !== merged.id) {
          await deleteMemory(id);
        }
      }
      compressed += c.ids.length - 1;
    } catch {
      // Skip on error
    }
  }

  return compressed;
}

/**
 * Find stale memories that should be forgotten.
 * Stale = not accessed in > 30 days, or low access count relative to age.
 */
export async function findStaleMemories(): Promise<Memory[]> {
  const all = await listMemories();
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const stale: Memory[] = [];

  for (const mem of all) {
    const access = ACCESS_LOG.get(mem.id);
    const updatedAt = new Date(mem.updatedAt).getTime();
    const age = now - updatedAt;

    // Forget rules:
    // 1. Instruction/context memories older than 30 days with no access
    if ((mem.type === 'context' || mem.type === 'instruction') && age > THIRTY_DAYS_MS && !access) {
      stale.push(mem);
      continue;
    }

    // 2. Fact/preference memories older than 7 days with low access count
    if ((mem.type === 'fact' || mem.type === 'preference') && age > SEVEN_DAYS_MS) {
      if (!access || access.accessCount < 2) {
        stale.push(mem);
      }
    }

    // 3. Any memory older than 90 days (hard limit)
    if (age > 90 * 24 * 60 * 60 * 1000) {
      stale.push(mem);
    }
  }

  return stale;
}

/**
 * Forget stale memories.
 */
export async function forgetStaleMemories(): Promise<number> {
  const stale = await findStaleMemories();
  let forgotten = 0;

  for (const mem of stale) {
    try {
      await deleteMemory(mem.id);
      ACCESS_LOG.delete(mem.id);
      forgotten++;
    } catch {
      // Skip
    }
  }

  return forgotten;
}

/**
 * Run full consolidation cycle: classify → compress → forget.
 */
export async function runConsolidation(): Promise<ConsolidationReport> {
  const totalBefore = await getMemoryCount();

  // Step 1: Auto-classify untyped memories
  const all = await listMemories();
  let classified = 0;
  for (const mem of all) {
    if (mem.type === 'fact' && mem.key.length > 5) {
      const suggestedType = autoClassify(mem.key, mem.value);
      if (suggestedType !== 'fact') {
        // Re-save with correct type (preserves id/key)
        await saveMemory(mem.key, mem.value, suggestedType, mem.id);
        classified++;
      }
    }
  }

  // Step 2: Compress similar memories
  const compressed = await compressMemories();

  // Step 3: Forget stale memories
  const forgotten = await forgetStaleMemories();

  const totalAfter = await getMemoryCount();

  return {
    classified,
    compressed,
    forgotten,
    consolidated: classified + compressed + forgotten,
    totalBefore,
    totalAfter,
  };
}

/**
 * Get memory health report.
 */
export async function getMemoryHealth(): Promise<{
  total: number;
  byType: Record<string, number>;
  stale: number;
  compressible: number;
  consolidationHistory: ConsolidationReport[];
}> {
  const all = await listMemories();
  const byType: Record<string, number> = {};
  for (const m of all) {
    byType[m.type] = (byType[m.type] || 0) + 1;
  }

  const stale = (await findStaleMemories()).length;
  const compressible = (await findCompressibleMemories()).length;

  return {
    total: all.length,
    byType,
    stale,
    compressible,
    consolidationHistory: [],
  };
}
