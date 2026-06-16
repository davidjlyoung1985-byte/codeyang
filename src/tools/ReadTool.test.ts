import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeRead } from './ReadTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-read-tool');

describe('ReadTool', () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('file reading', () => {
    it('should read a file and return its content', async () => {
      const fp = path.join(TEST_DIR, 'hello.txt');
      await fs.writeFile(fp, 'Hello, World!\nSecond line\nThird line');
      expect(await executeRead(fp)).toBe('Hello, World!\nSecond line\nThird line');
    });

    it('should read a file with offset and limit', async () => {
      const fp = path.join(TEST_DIR, 'numbered.txt');
      await fs.writeFile(fp, Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n'));
      const result = await executeRead(fp, 4, 5);
      expect(result).toContain('Lines 5-9 of 20');
      expect(result).toContain('Line 5');
      expect(result).toContain('Line 9');
    });

    it('should read with offset only (to end of file)', async () => {
      const fp = path.join(TEST_DIR, 'numbered.txt');
      await fs.writeFile(fp, Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n'));
      const result = await executeRead(fp, 5);
      expect(result).toContain('Lines 6-10 of 10');
      expect(result).toContain('Line 10');
      expect(result).not.toMatch(/^1: Line 1$/m);
    });

    it('should show line numbers with offset', async () => {
      const fp = path.join(TEST_DIR, 'lines.txt');
      await fs.writeFile(fp, 'a\nb\nc\nd\ne');
      const result = await executeRead(fp, 1, 2);
      expect(result).toContain('2: ');
      expect(result).toContain('3: ');
    });

    it('should handle offset beyond file bounds gracefully', async () => {
      const fp = path.join(TEST_DIR, 'short.txt');
      await fs.writeFile(fp, 'short');
      const result = await executeRead(fp, 10, 5);
      expect(result).toContain('of 1');
    });
  });

  describe('directory listing', () => {
    it('should list directory contents', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'file1.txt'), '');
      await fs.writeFile(path.join(TEST_DIR, 'file2.txt'), '');
      await fs.mkdir(path.join(TEST_DIR, 'subdir'));
      const result = await executeRead(TEST_DIR);
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
      expect(result).toContain('subdir/');
    });

    it('should sort directories before files', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'a.txt'), '');
      await fs.mkdir(path.join(TEST_DIR, 'z-dir'));
      const result = await executeRead(TEST_DIR);
      const lines = result.split('\n');
      expect(lines.findIndex((l) => l === 'z-dir/')).toBeLessThan(lines.findIndex((l) => l === 'a.txt'));
    });

    it('should report empty directory', async () => {
      expect(await executeRead(TEST_DIR)).toBe('(empty directory)');
    });

    it('should use proper pluralization', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'only.txt'), '');
      const result = await executeRead(TEST_DIR);
      expect(result).toContain('1 file');
    });
  });

  describe('error handling', () => {
    it('should throw on non-existent file', async () => {
      await expect(executeRead(path.join(TEST_DIR, 'nonexistent.txt'))).rejects.toThrow(/not found/i);
    });
  });

  describe('edge cases', () => {
    it('should read empty file', async () => {
      const fp = path.join(TEST_DIR, 'empty.txt');
      await fs.writeFile(fp, '');
      expect(await executeRead(fp)).toBe('');
    });

    it('should read file with Unicode content', async () => {
      const fp = path.join(TEST_DIR, 'unicode.txt');
      const content = 'Hello 世界\n🌍 Unicode\ncafé';
      await fs.writeFile(fp, content);
      expect(await executeRead(fp)).toBe(content);
    });

    it('should handle relative paths', async () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(TEST_DIR);
        await fs.writeFile('rel.txt', 'relative');
        expect(await executeRead('rel.txt')).toBe('relative');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
