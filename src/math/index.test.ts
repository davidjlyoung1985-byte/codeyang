import { describe, it, expect } from 'vitest';
import { executeMathSolve } from './MathSolve.js';

// ──────────────────────────────────────────────
// Linear equations
// ──────────────────────────────────────────────

describe('MathSolve — linear', () => {
  it('solves 3x + 5 = 20', async () => {
    const r = await executeMathSolve('3x + 5 = 20', 'linear');
    expect(r).toContain('5');
  });

  it('solves x - 7 = 3', async () => {
    const r = await executeMathSolve('x - 7 = 3', 'linear');
    expect(r).toContain('10');
  });

  it('solves negative coefficient: -2x = 10', async () => {
    const r = await executeMathSolve('-2x=10', 'linear');
    expect(r).toContain('-5');
  });
});

// ──────────────────────────────────────────────
// Quadratic equations
// ──────────────────────────────────────────────

describe('MathSolve — quadratic', () => {
  it('solves x² + 3x - 4 = 0', async () => {
    const r = await executeMathSolve('x^2 + 3x - 4 = 0', 'quadratic');
    expect(r).toContain('1');
    expect(r).toContain('-4');
  });

  it('solves x² - 6x + 9 = 0 (double root)', async () => {
    const r = await executeMathSolve('x^2 - 6x + 9 = 0', 'quadratic');
    expect(r).toContain('3');
  });

  it('detects no real roots', async () => {
    const r = await executeMathSolve('x^2 + x + 1 = 0', 'quadratic');
    expect(r).toContain('无实数根');
  });
});

// ──────────────────────────────────────────────
// Pythagorean
// ──────────────────────────────────────────────

describe('MathSolve — pythagorean', () => {
  it('finds hypotenuse: a=3 b=4', async () => {
    const r = await executeMathSolve('a=3 b=4', 'pythagorean');
    expect(r).toContain('5');
  });

  it('finds leg: a=3 c=5', async () => {
    const r = await executeMathSolve('a=3 c=5', 'pythagorean');
    expect(r).toContain('4');
  });
});

// ──────────────────────────────────────────────
// Statistics
// ──────────────────────────────────────────────

describe('MathSolve — stats', () => {
  it('computes mean/median/mode/range', async () => {
    const r = await executeMathSolve('mean [2, 5, 8, 3, 7]', 'stats');
    expect(r).toContain('平均数');
    expect(r).toContain('中位数');
    expect(r).toContain('5');
  });

  it('handles even count median', async () => {
    const r = await executeMathSolve('stats [1,3,5,7]', 'stats');
    expect(r).toContain('4');
  });
});

// ──────────────────────────────────────────────
// Circle
// ──────────────────────────────────────────────

describe('MathSolve — circle', () => {
  it('calculates area and circumference', async () => {
    const r = await executeMathSolve('radius=5 circle', 'circle');
    expect(r).toContain('78');
    expect(r).toContain('31');
  });
});

// ──────────────────────────────────────────────
// Trigonometry
// ──────────────────────────────────────────────

describe('MathSolve — trig', () => {
  it('shows angle table', async () => {
    const r = await executeMathSolve('45 degrees to radians', 'trig');
    expect(r).toContain('常用角度');
    expect(r).toContain('45');
  });
});

// ──────────────────────────────────────────────
// Sequences
// ──────────────────────────────────────────────

describe('MathSolve — sequence', () => {
  it('solves arithmetic sequence', async () => {
    const r = await executeMathSolve('arithmetic a1=3 d=2 n=10', 'sequence');
    expect(r).toContain('21'); // a10 = 3 + 9*2 = 21
  });

  it('solves geometric sequence', async () => {
    const r = await executeMathSolve('geometric a1=3 r=2 n=4', 'sequence');
    expect(r).toContain('24'); // a4 = 3 * 2^3 = 24
  });
});

// ──────────────────────────────────────────────
// Coordinate
// ──────────────────────────────────────────────

describe('MathSolve — coordinate', () => {
  it('computes distance between points', async () => {
    const r = await executeMathSolve('distance (1,2) (4,6)', 'coord');
    expect(r).toContain('5');
  });

  it('computes midpoint', async () => {
    const r = await executeMathSolve('midpoint (0,0) (6,8)', 'coord');
    expect(r).toContain('3');
    expect(r).toContain('4');
  });
});

// ──────────────────────────────────────────────
// Unknown type
// ──────────────────────────────────────────────

describe('MathSolve — unknown', () => {
  it('returns help for unknown type', async () => {
    const r = await executeMathSolve('???', 'unknown');
    expect(r).toContain('Unknown problem type');
  });
});
