import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readLargeFileChunked, readLargeFileByLine, readFileTail, shouldUseStreaming } from './largeFileReader.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('largeFileReader', () => {
  let testDir: string;
  let testFile: string;
  let largeFile: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `codeyang-largefile-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });

    testFile = join(testDir, 'test.txt');
    await writeFile(testFile, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n');

    // Create a larger file for chunked reading
    largeFile = join(testDir, 'large.txt');
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`);
    await writeFile(largeFile, lines.join('\n'));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('readLargeFileChunked', () => {
    it('reads entire file', async () => {
      const content = await readLargeFileChunked(testFile);
      expect(content).toContain('Line 1');
      expect(content).toContain('Line 5');
    });

    it('reads with offset', async () => {
      const content = await readLargeFileChunked(testFile, { offset: 7 });
      expect(content).not.toContain('Line 1');
      expect(content).toContain('Line 2');
    });

    it('reads with limit', async () => {
      const content = await readLargeFileChunked(testFile, { limit: 10 });
      expect(content.length).toBeLessThanOrEqual(10);
    });

    it('reads with custom chunk size', async () => {
      const content = await readLargeFileChunked(testFile, { chunkSize: 5 });
      expect(content).toContain('Line 1');
    });

    it('handles large files efficiently', async () => {
      const content = await readLargeFileChunked(largeFile, { limit: 1000 });
      expect(content.length).toBeLessThanOrEqual(1000);
    });

    it('throws error for non-existent file', async () => {
      await expect(readLargeFileChunked(join(testDir, 'nonexistent.txt'))).rejects.toThrow();
    });
  });

  describe('readLargeFileByLine', () => {
    it('reads all lines', async () => {
      const lines: string[] = [];
      await readLargeFileByLine(testFile, (line) => {
        lines.push(line);
      });

      expect(lines.length).toBe(5);
      expect(lines[0]).toBe('Line 1');
      expect(lines[4]).toBe('Line 5');
    });

    it('provides line numbers', async () => {
      const lineNumbers: number[] = [];
      await readLargeFileByLine(testFile, (_, lineNumber) => {
        lineNumbers.push(lineNumber);
      });

      expect(lineNumbers).toEqual([1, 2, 3, 4, 5]);
    });

    it('stops when callback returns false', async () => {
      const lines: string[] = [];
      await readLargeFileByLine(testFile, (line) => {
        lines.push(line);
        if (lines.length >= 3) return false;
      });

      expect(lines.length).toBe(3);
    });

    it('handles large files line by line', async () => {
      let count = 0;
      await readLargeFileByLine(largeFile, () => {
        count++;
      });

      expect(count).toBe(1000);
    });

    it('throws error for non-existent file', async () => {
      await expect(readLargeFileByLine(join(testDir, 'nonexistent.txt'), () => {})).rejects.toThrow();
    });
  });

  describe('shouldUseStreaming', () => {
    it('returns boolean for file streaming decision', async () => {
      const result = await shouldUseStreaming(testFile);
      expect(typeof result).toBe('boolean');
    });

    it('suggests streaming for large files', async () => {
      const result = await shouldUseStreaming(largeFile);
      expect(typeof result).toBe('boolean');
    });

    it('throws error for non-existent file', async () => {
      await expect(shouldUseStreaming(join(testDir, 'nonexistent.txt'))).rejects.toThrow();
    });
  });

  describe('readFileTail', () => {
    it('reads tail of file', async () => {
      const lines = await readFileTail(testFile, 2);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('returns lines when requested', async () => {
      const lines = await readFileTail(testFile, 100);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('handles single line request', async () => {
      const lines = await readFileTail(testFile, 1);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('handles large files without error', async () => {
      const lines = await readFileTail(largeFile, 10);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('throws error for non-existent file', async () => {
      await expect(readFileTail(join(testDir, 'nonexistent.txt'), 5)).rejects.toThrow();
    });
  });

  describe('performance and edge cases', () => {
    it('handles empty file', async () => {
      const emptyFile = join(testDir, 'empty.txt');
      await writeFile(emptyFile, '');

      const content = await readLargeFileChunked(emptyFile);
      expect(content).toBe('');

      const lines: string[] = [];
      await readLargeFileByLine(emptyFile, (line) => {
        lines.push(line);
      });
      expect(lines.length).toBe(0);
    });

    it('handles file with single line', async () => {
      const singleLineFile = join(testDir, 'single.txt');
      await writeFile(singleLineFile, 'Only one line');

      const lines: string[] = [];
      await readLargeFileByLine(singleLineFile, (line) => {
        lines.push(line);
      });
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe('Only one line');
    });

    it('handles file with no trailing newline', async () => {
      const noNewlineFile = join(testDir, 'no-newline.txt');
      await writeFile(noNewlineFile, 'Line 1\nLine 2');

      const lines: string[] = [];
      await readLargeFileByLine(noNewlineFile, (line) => {
        lines.push(line);
      });
      expect(lines.length).toBe(2);
    });

    it('handles unicode content', async () => {
      const unicodeFile = join(testDir, 'unicode.txt');
      await writeFile(unicodeFile, '你好世界\nHello World\n안녕하세요');

      const content = await readLargeFileChunked(unicodeFile);
      expect(content).toContain('你好世界');
      expect(content).toContain('안녕하세요');
    });
  });
});
