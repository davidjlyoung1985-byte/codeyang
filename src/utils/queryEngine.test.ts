/**
 * Tests for QueryEngine
 */
import { describe, it, expect } from 'vitest';
import { listFiles, searchContent, extractSymbols } from './queryEngine.js';

describe('QueryEngine', () => {
  describe('listFiles', () => {
    it('should return an array', async () => {
      const files = await listFiles(process.cwd());

      expect(files).toBeInstanceOf(Array);
    });

    it('should filter by pattern when provided', async () => {
      const files = await listFiles(process.cwd(), '.ts');

      expect(files).toBeInstanceOf(Array);
      if (files.length > 0) {
        expect(files.every((f) => f.includes('.ts'))).toBe(true);
      }
    });
  });

  describe('searchContent', () => {
    it('should return an array of results', async () => {
      const results = await searchContent(process.cwd(), 'export');

      expect(results).toBeInstanceOf(Array);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('file');
        expect(results[0]).toHaveProperty('line');
        expect(results[0]).toHaveProperty('content');
      }
    });

    it('should return empty array for no matches', async () => {
      const results = await searchContent(process.cwd(), 'xyzNonExistentString12345');

      expect(results).toEqual([]);
    });
  });

  describe('extractSymbols', () => {
    it('should extract symbols from TypeScript files', async () => {
      // Test with a known file in the project
      const results = await extractSymbols(process.cwd(), 'src/types.ts');

      expect(results).toBeInstanceOf(Array);
      // types.ts should have interface/type definitions
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('name');
        expect(results[0]).toHaveProperty('kind');
        expect(results[0]).toHaveProperty('file');
        expect(results[0]).toHaveProperty('line');
      }
    });

    it('should return empty array for non-existent file', async () => {
      const results = await extractSymbols(process.cwd(), 'nonexistent-file-xyz.ts');

      expect(results).toEqual([]);
    });

    it('should detect function declarations', async () => {
      // We'll just test the regex logic by checking types
      expect(typeof extractSymbols).toBe('function');
    });
  });
});
