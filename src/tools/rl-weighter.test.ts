/**
 * Tests for RL tool weighting system
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordToolOutcome,
  getToolWeight,
  getAllToolWeights,
  rankToolsByRL,
  suggestAlternative,
} from './rl-weighter.js';

describe('RL Weighter', () => {
  beforeEach(async () => {
    await recordToolOutcome('_reset', true, 0);
  });

  it('returns default weight for unknown tools', () => {
    const w = getToolWeight('NonexistentTool');
    expect(w).toBe(50);
  });

  it('increases weight after successful calls', async () => {
    await recordToolOutcome('Bash', true, 100);
    await recordToolOutcome('Bash', true, 50);
    const w = getToolWeight('Bash');
    expect(w).toBeGreaterThan(50);
  });

  it('decreases weight after failed calls', async () => {
    await recordToolOutcome('FailingTool', false, 100, 'error msg');
    await recordToolOutcome('FailingTool', false, 100, 'error msg');
    const w = getToolWeight('FailingTool');
    expect(w).toBeLessThan(50);
  });

  it('returns all tool weights sorted', async () => {
    await recordToolOutcome('ToolA', true, 10);
    await recordToolOutcome('ToolB', false, 10, 'err');
    const all = getAllToolWeights();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all[0].weight).toBeGreaterThanOrEqual(all[1].weight);
  });

  it('ranks tools by RL weight', async () => {
    await recordToolOutcome('Best', true, 10);
    await recordToolOutcome('Worst', false, 10, 'err');
    const ranked = rankToolsByRL(['Worst', 'Best']);
    expect(ranked[0]).toBe('Best');
  });

  it('suggestAlternative returns null for unknown tool', () => {
    const alt = suggestAlternative('Unknown', ['A', 'B']);
    expect(alt).toBeNull();
  });
});
