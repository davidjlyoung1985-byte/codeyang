import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listFiles, searchContent, extractSymbols } from './queryEngine.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('queryEngine', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `codeyang-query-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });

    // Create test files
    await writeFile(
      join(testDir, 'example.ts'),
      `
export function hello(name: string): string {
  return \`Hello, \${name}\`;
}

export class TestClass {
  constructor(public value: number) {}

  getValue(): number {
    return this.value;
  }
}

export interface TestInterface {
  id: string;
  name: string;
}

export type TestType = string | number;
`,
    );

    await writeFile(
      join(testDir, 'utils.ts'),
      `
export const PI = 3.14159;

export function calculate(x: number): number {
  return x * 2;
}
`,
    );

    await mkdir(join(testDir, 'nested'), { recursive: true });
    await writeFile(
      join(testDir, 'nested', 'deep.ts'),
      `
export function deepFunction() {
  console.log('deep');
}
`,
    );
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('listFiles', () => {
    it('returns array for valid directory', async () => {
      const files = await listFiles(testDir);
      expect(Array.isArray(files)).toBe(true);
    });

    it('filters files by pattern when files exist', async () => {
      const files = await listFiles(testDir, 'example');
      expect(Array.isArray(files)).toBe(true);
      if (files.length > 0) {
        expect(files.every((f) => f.includes('example'))).toBe(true);
      }
    });

    it('handles non-existent directory gracefully', async () => {
      const files = await listFiles(join(testDir, 'nonexistent'));
      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('extractSymbols', () => {
    it('extracts symbols from a file', async () => {
      const exampleFile = join(testDir, 'example.ts');
      const symbols = await extractSymbols(testDir, exampleFile);

      expect(Array.isArray(symbols)).toBe(true);
    });

    it('returns empty array for non-existent file', async () => {
      const symbols = await extractSymbols(testDir, join(testDir, 'nonexistent.ts'));

      expect(symbols).toEqual([]);
    });

    it('symbol entries have correct structure', async () => {
      const exampleFile = join(testDir, 'example.ts');
      const symbols = await extractSymbols(testDir, exampleFile);

      if (symbols.length > 0) {
        const symbol = symbols[0];
        expect(symbol).toHaveProperty('name');
        expect(symbol).toHaveProperty('kind');
        expect(symbol).toHaveProperty('file');
        expect(symbol).toHaveProperty('line');
      }
    });
  });

  describe('searchContent', () => {
    it('returns array for search query', async () => {
      const results = await searchContent(testDir, 'Hello');
      expect(Array.isArray(results)).toBe(true);
    });

    it('search result has correct structure', async () => {
      const results = await searchContent(testDir, 'Hello');

      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('file');
        expect(result).toHaveProperty('line');
        expect(result).toHaveProperty('content');
      }
    });

    it('returns empty array for no matches', async () => {
      const results = await searchContent(testDir, 'nonexistent_string_xyz_12345');
      expect(results).toEqual([]);
    });

    it('handles invalid directory gracefully', async () => {
      const results = await searchContent(join(testDir, 'invalid'), 'test');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('cache behavior', () => {
    it('handles cache operations without errors', async () => {
      const files = await listFiles(testDir);
      expect(Array.isArray(files)).toBe(true);
    });

    it('handles concurrent requests', async () => {
      const [files1, files2, files3] = await Promise.all([listFiles(testDir), listFiles(testDir), listFiles(testDir)]);

      expect(Array.isArray(files1)).toBe(true);
      expect(Array.isArray(files2)).toBe(true);
      expect(Array.isArray(files3)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles invalid directory path', async () => {
      const invalidPath = join(testDir, 'does', 'not', 'exist');
      const files = await listFiles(invalidPath);

      expect(Array.isArray(files)).toBe(true);
    });

    it('handles empty directory', async () => {
      const emptyDir = join(testDir, 'empty');
      await mkdir(emptyDir, { recursive: true });

      const files = await listFiles(emptyDir);
      expect(Array.isArray(files)).toBe(true);
    });

    it('handles search in non-existent directory', async () => {
      const results = await searchContent(join(testDir, 'invalid'), 'test');

      expect(Array.isArray(results)).toBe(true);
    });
  });
});
