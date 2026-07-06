import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, unlink } from 'node:fs/promises';
import {
  readLargeFileChunked,
  readLargeFileByLine,
  readFileWithPagination,
  shouldUseStreaming,
  readFileTail,
} from './largeFileReader.js';

describe('Large File Reader', () => {
  const testFile = '.tmp-large-file-test.txt';
  const smallFile = '.tmp-small-file-test.txt';

  beforeAll(async () => {
    // Create a test file with 1000 lines
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}: Test content`);
    await writeFile(testFile, lines.join('\n'), 'utf-8');

    // Create a small test file
    await writeFile(smallFile, 'Small file content\nLine 2\nLine 3', 'utf-8');
  });

  afterAll(async () => {
    await unlink(testFile).catch(() => {});
    await unlink(smallFile).catch(() => {});
  });

  describe('readLargeFileChunked', () => {
    it('should read entire file', async () => {
      const content = await readLargeFileChunked(testFile);
      const lines = content.split('\n');

      expect(lines).toHaveLength(1000);
      expect(lines[0]).toBe('Line 1: Test content');
      expect(lines[999]).toBe('Line 1000: Test content');
    });

    it('should read with offset', async () => {
      const content = await readLargeFileChunked(testFile, { offset: 100 });

      // Should skip first 100 bytes
      expect(content.length).toBeGreaterThan(0);
      expect(content.length).toBeLessThan(23000); // Less than full file
    });

    it('should read with limit', async () => {
      const content = await readLargeFileChunked(testFile, { limit: 100 });

      expect(content.length).toBeLessThanOrEqual(100);
    });
  });

  describe('readLargeFileByLine', () => {
    it('should read all lines', async () => {
      const lines: string[] = [];

      const totalLines = await readLargeFileByLine(testFile, (line) => {
        lines.push(line);
      });

      expect(totalLines).toBe(1000);
      expect(lines).toHaveLength(1000);
      expect(lines[0]).toBe('Line 1: Test content');
    });

    it('should stop early when callback returns false', async () => {
      const lines: string[] = [];

      const totalLines = await readLargeFileByLine(testFile, (line, lineNum) => {
        lines.push(line);
        return lineNum < 10; // Stop after 10 lines
      });

      expect(totalLines).toBe(10);
      expect(lines).toHaveLength(10);
    });
  });

  describe('readFileWithPagination', () => {
    it('should paginate file', async () => {
      const result = await readFileWithPagination(testFile, 0, 50);

      expect(result.lines).toHaveLength(50);
      expect(result.totalLines).toBeGreaterThan(0);
      expect(result.hasMore).toBe(true);
      expect(result.lines[0]).toBe('Line 1: Test content');
    });

    it('should handle offset', async () => {
      const result = await readFileWithPagination(testFile, 100, 50);

      expect(result.lines).toHaveLength(50);
      expect(result.lines[0]).toBe('Line 101: Test content');
    });

    it('should detect no more pages', async () => {
      const result = await readFileWithPagination(testFile, 900, 200);

      expect(result.lines).toHaveLength(100);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('shouldUseStreaming', () => {
    it('should return false for small files', async () => {
      const result = await shouldUseStreaming(smallFile);
      expect(result).toBe(false);
    });

    it('should return false for non-existent files', async () => {
      const result = await shouldUseStreaming('non-existent-file.txt');
      expect(result).toBe(false);
    });
  });

  describe('readFileTail', () => {
    it('should read last N lines', async () => {
      const lines = await readFileTail(testFile, 10);

      expect(lines).toHaveLength(10);
      expect(lines[9]).toBe('Line 1000: Test content');
      expect(lines[0]).toBe('Line 991: Test content');
    });

    it('should handle small files', async () => {
      const lines = await readFileTail(smallFile, 10);

      expect(lines.length).toBeLessThanOrEqual(10);
      expect(lines[lines.length - 1]).toBe('Line 3');
    });
  });
});
