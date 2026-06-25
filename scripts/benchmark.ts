#!/usr/bin/env node
/**
 * Benchmark runner for CodeYang.
 *
 * Usage:
 *   npm run benchmark              # Run all benchmarks
 *   npm run benchmark -- grep      # Run grep benchmarks only
 *   npm run benchmark -- --verbose # Verbose output
 */

import { performance } from 'node:perf_hooks';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
  minMs: number;
  maxMs: number;
}

class Benchmark {
  private results: BenchmarkResult[] = [];

  async run(name: string, fn: () => Promise<void> | void, iterations = 100): Promise<BenchmarkResult> {
    const times: number[] = [];

    // Warmup
    for (let i = 0; i < Math.min(10, iterations); i++) {
      await fn();
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    const totalMs = times.reduce((a, b) => a + b, 0);
    const avgMs = totalMs / iterations;
    const minMs = Math.min(...times);
    const maxMs = Math.max(...times);
    const opsPerSec = 1000 / avgMs;

    const result: BenchmarkResult = {
      name,
      iterations,
      totalMs,
      avgMs,
      opsPerSec,
      minMs,
      maxMs,
    };

    this.results.push(result);
    return result;
  }

  printResults(): void {
    console.log('\n=== Benchmark Results ===\n');

    for (const result of this.results) {
      console.log(`${result.name}:`);
      console.log(`  Iterations: ${result.iterations}`);
      console.log(`  Total:      ${result.totalMs.toFixed(2)}ms`);
      console.log(`  Average:    ${result.avgMs.toFixed(3)}ms`);
      console.log(`  Ops/sec:    ${result.opsPerSec.toFixed(0)}`);
      console.log(`  Min:        ${result.minMs.toFixed(3)}ms`);
      console.log(`  Max:        ${result.maxMs.toFixed(3)}ms`);
      console.log('');
    }
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }
}

// ── Benchmarks ─────────────────────────────────────────────────────────

async function benchmarkFileOperations() {
  const bench = new Benchmark();
  const tempDir = join(tmpdir(), `bench-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  const testFile = join(tempDir, 'test.txt');
  const smallContent = 'Hello World!';
  const largeContent = 'x'.repeat(1024 * 1024); // 1MB

  try {
    await bench.run('Write small file (12 bytes)', async () => {
      await writeFile(testFile, smallContent);
    });

    await bench.run('Read small file (12 bytes)', async () => {
      await readFile(testFile, 'utf-8');
    });

    await writeFile(testFile, largeContent);

    await bench.run(
      'Read large file (1MB)',
      async () => {
        await readFile(testFile, 'utf-8');
      },
      50,
    );

    bench.printResults();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function benchmarkStringOperations() {
  const bench = new Benchmark();

  const shortStr = 'Hello World!';
  const longStr = 'x'.repeat(10000);

  await bench.run('String concatenation (short)', () => {
    let result = '';
    for (let i = 0; i < 100; i++) {
      result += shortStr;
    }
  });

  await bench.run('String array join (short)', () => {
    const arr: string[] = [];
    for (let i = 0; i < 100; i++) {
      arr.push(shortStr);
    }
    arr.join('');
  });

  await bench.run('RegExp match (simple)', () => {
    /hello/i.test(longStr);
  });

  await bench.run('RegExp match (complex)', () => {
    /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test('test@example.com');
  });

  bench.printResults();
}

async function benchmarkJsonOperations() {
  const bench = new Benchmark();

  const smallObj = { name: 'test', value: 42 };
  const largeObj = {
    users: Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      active: i % 2 === 0,
    })),
  };

  const smallJson = JSON.stringify(smallObj);
  const largeJson = JSON.stringify(largeObj);

  await bench.run('JSON.stringify (small)', () => {
    JSON.stringify(smallObj);
  });

  await bench.run('JSON.parse (small)', () => {
    JSON.parse(smallJson);
  });

  await bench.run('JSON.stringify (large)', () => {
    JSON.stringify(largeObj);
  });

  await bench.run('JSON.parse (large)', () => {
    JSON.parse(largeJson);
  });

  bench.printResults();
}

async function benchmarkCacheOperations() {
  const bench = new Benchmark();
  const cache = new Map<string, string>();

  await bench.run('Map.set', () => {
    cache.set(`key-${Math.random()}`, 'value');
  });

  // Populate cache
  for (let i = 0; i < 1000; i++) {
    cache.set(`key-${i}`, `value-${i}`);
  }

  await bench.run('Map.get (hit)', () => {
    cache.get('key-500');
  });

  await bench.run('Map.get (miss)', () => {
    cache.get('nonexistent');
  });

  await bench.run('Map.has', () => {
    cache.has('key-500');
  });

  await bench.run('Map.delete', () => {
    cache.delete('key-999');
  });

  bench.printResults();
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const filter = process.argv[2];
  const verbose = process.argv.includes('--verbose');

  console.log('CodeYang Benchmark Suite\n');

  if (verbose) {
    console.log('Running in verbose mode...\n');
  }

  const benchmarks = [
    { name: 'file', fn: benchmarkFileOperations },
    { name: 'string', fn: benchmarkStringOperations },
    { name: 'json', fn: benchmarkJsonOperations },
    { name: 'cache', fn: benchmarkCacheOperations },
  ];

  for (const { name, fn } of benchmarks) {
    if (filter && !name.includes(filter)) {
      console.log(`Skipping ${name} benchmarks...`);
      continue;
    }

    console.log(`\n┌─ ${name.toUpperCase()} Benchmarks ────────────────────────────────`);
    await fn();
    console.log('└──────────────────────────────────────────────────────\n');
  }

  console.log('Benchmarks complete!');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
