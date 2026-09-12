/**
 * Performance Benchmark Suite for CodeYang
 *
 * Measures key operations to establish performance baselines and detect regressions.
 * Run with: npm run bench
 */

import { describe, bench } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── File Operations Benchmarks ────────────────────────────────────

describe('File Operations Performance', () => {
  const testDir = join(tmpdir(), 'codeyang-bench');
  const smallFile = join(testDir, 'small.txt');
  const mediumFile = join(testDir, 'medium.txt');
  const largeFile = join(testDir, 'large.txt');

  // Setup test files
  const setup = async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(smallFile, 'x'.repeat(1024)); // 1KB
    await writeFile(mediumFile, 'x'.repeat(100 * 1024)); // 100KB
    await writeFile(largeFile, 'x'.repeat(1024 * 1024)); // 1MB
  };

  bench('read small file (1KB)', async () => {
    await setup();
    await readFile(smallFile, 'utf-8');
  });

  bench('read medium file (100KB)', async () => {
    await setup();
    await readFile(mediumFile, 'utf-8');
  });

  bench('read large file (1MB)', async () => {
    await setup();
    await readFile(largeFile, 'utf-8');
  });

  bench('write small file (1KB)', async () => {
    await setup();
    await writeFile(join(testDir, 'write-small.txt'), 'x'.repeat(1024));
  });

  bench('write medium file (100KB)', async () => {
    await setup();
    await writeFile(join(testDir, 'write-medium.txt'), 'x'.repeat(100 * 1024));
  });
});

// ─── String Operations Benchmarks ──────────────────────────────────

describe('String Operations Performance', () => {
  const shortText = 'Hello, world!';
  const mediumText = 'x'.repeat(1000);
  const longText = 'x'.repeat(10000);

  bench('JSON.parse small object', () => {
    JSON.parse('{"key":"value"}');
  });

  bench('JSON.parse medium object', () => {
    const obj = { data: mediumText, nested: { a: 1, b: 2, c: 3 } };
    JSON.parse(JSON.stringify(obj));
  });

  bench('JSON.stringify small object', () => {
    JSON.stringify({ key: 'value' });
  });

  bench('JSON.stringify medium object', () => {
    JSON.stringify({ data: mediumText, nested: { a: 1, b: 2, c: 3 } });
  });

  bench('string split and join', () => {
    longText.split('').join('');
  });

  bench('regex match', () => {
    /\b\w+\b/g.test(mediumText);
  });
});

// ─── Array Operations Benchmarks ───────────────────────────────────

describe('Array Operations Performance', () => {
  const smallArray = Array.from({ length: 100 }, (_, i) => i);
  const mediumArray = Array.from({ length: 1000 }, (_, i) => i);
  const largeArray = Array.from({ length: 10000 }, (_, i) => i);

  bench('array map (100 items)', () => {
    smallArray.map((x) => x * 2);
  });

  bench('array map (1000 items)', () => {
    mediumArray.map((x) => x * 2);
  });

  bench('array filter (100 items)', () => {
    smallArray.filter((x) => x % 2 === 0);
  });

  bench('array filter (1000 items)', () => {
    mediumArray.filter((x) => x % 2 === 0);
  });

  bench('array reduce (100 items)', () => {
    smallArray.reduce((acc, x) => acc + x, 0);
  });

  bench('array reduce (1000 items)', () => {
    mediumArray.reduce((acc, x) => acc + x, 0);
  });

  bench('array sort (1000 items)', () => {
    [...mediumArray].sort((a, b) => b - a);
  });

  bench('array find (1000 items)', () => {
    mediumArray.find((x) => x === 500);
  });
});

// ─── Object Operations Benchmarks ──────────────────────────────────

describe('Object Operations Performance', () => {
  const smallObj = { a: 1, b: 2, c: 3 };
  const mediumObj = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key${i}`, i]));
  const largeObj = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`key${i}`, i]));

  bench('Object.keys small object', () => {
    Object.keys(smallObj);
  });

  bench('Object.keys medium object', () => {
    Object.keys(mediumObj);
  });

  bench('Object.entries medium object', () => {
    Object.entries(mediumObj);
  });

  bench('Object.assign small objects', () => {
    Object.assign({}, smallObj, { d: 4 });
  });

  bench('spread operator small objects', () => {
    ({ ...smallObj, d: 4 });
  });

  bench('Object.assign medium objects', () => {
    Object.assign({}, mediumObj, { extra: 'value' });
  });

  bench('spread operator medium objects', () => {
    ({ ...mediumObj, extra: 'value' });
  });
});

// ─── Cache Operations Benchmarks ───────────────────────────────────

describe('Cache Operations Performance', () => {
  const cache = new Map<string, string>();

  bench('Map set', () => {
    cache.set('key', 'value');
  });

  bench('Map get (hit)', () => {
    cache.set('test', 'value');
    cache.get('test');
  });

  bench('Map get (miss)', () => {
    cache.get('nonexistent');
  });

  bench('Map has', () => {
    cache.set('test', 'value');
    cache.has('test');
  });

  bench('Map delete', () => {
    cache.set('test', 'value');
    cache.delete('test');
  });

  bench('Object property access', () => {
    const obj: Record<string, string> = { key: 'value' };
    obj.key;
  });

  bench('Map vs Object: 100 writes', () => {
    const map = new Map();
    for (let i = 0; i < 100; i++) {
      map.set(`key${i}`, i);
    }
  });

  bench('Object vs Map: 100 writes', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      obj[`key${i}`] = i;
    }
  });
});

// ─── Async Operations Benchmarks ───────────────────────────────────

describe('Async Operations Performance', () => {
  bench('Promise.resolve', async () => {
    await Promise.resolve('value');
  });

  bench('Promise.all (3 promises)', async () => {
    await Promise.all([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]);
  });

  bench('Promise.all (10 promises)', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => Promise.resolve(i)));
  });

  bench('sequential awaits (3 operations)', async () => {
    await Promise.resolve(1);
    await Promise.resolve(2);
    await Promise.resolve(3);
  });

  bench('setTimeout promise wrapper', async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

// ─── Expected Performance Baselines ────────────────────────────────

/**
 * Performance Targets (approximate, machine-dependent)
 *
 * File Operations:
 * - Read 1KB file: < 1ms
 * - Read 100KB file: < 5ms
 * - Read 1MB file: < 20ms
 * - Write 1KB file: < 2ms
 * - Write 100KB file: < 10ms
 *
 * String Operations:
 * - JSON.parse small: < 0.01ms
 * - JSON.stringify small: < 0.01ms
 * - String split/join (10k chars): < 1ms
 * - Regex match: < 0.1ms
 *
 * Array Operations:
 * - Map 1000 items: < 0.1ms
 * - Filter 1000 items: < 0.1ms
 * - Reduce 1000 items: < 0.05ms
 * - Sort 1000 items: < 0.5ms
 *
 * Object Operations:
 * - Object.keys (100 keys): < 0.01ms
 * - Object.assign (100 keys): < 0.05ms
 * - Spread operator: < 0.05ms
 *
 * Cache Operations:
 * - Map set/get/has: < 0.001ms
 * - 100 Map writes: < 0.01ms
 *
 * Async Operations:
 * - Promise.resolve: < 0.01ms
 * - Promise.all (10 promises): < 0.1ms
 *
 * Note: These are rough targets. Actual performance varies by hardware.
 * Use these benchmarks to detect performance regressions, not absolute values.
 */
