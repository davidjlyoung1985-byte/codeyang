import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { safeRenameWithSuffix, atomicRename, fileExists, getFileSize, isDirectory, isFile } from './fileSystem.js';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('fileSystem', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `codeyang-fs-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      const file = join(testDir, 'exists.txt');
      await writeFile(file, 'content');

      const exists = await fileExists(file);
      expect(exists).toBe(true);
    });

    it('returns false for non-existent file', async () => {
      const exists = await fileExists(join(testDir, 'nonexistent.txt'));
      expect(exists).toBe(false);
    });

    it('returns true for directory', async () => {
      const dir = join(testDir, 'subdir');
      await mkdir(dir);

      const exists = await fileExists(dir);
      expect(exists).toBe(true);
    });
  });

  describe('getFileSize', () => {
    it('returns file size in bytes', async () => {
      const file = join(testDir, 'sized.txt');
      await writeFile(file, 'hello world');

      const size = await getFileSize(file);
      expect(size).toBeGreaterThan(0);
    });

    it('returns correct size for empty file', async () => {
      const file = join(testDir, 'empty.txt');
      await writeFile(file, '');

      const size = await getFileSize(file);
      expect(size).toBe(0);
    });

    it('throws error for non-existent file', async () => {
      await expect(getFileSize(join(testDir, 'nonexistent.txt'))).rejects.toThrow();
    });
  });

  describe('isDirectory', () => {
    it('returns true for directory', async () => {
      const dir = join(testDir, 'subdir');
      await mkdir(dir);

      const result = await isDirectory(dir);
      expect(result).toBe(true);
    });

    it('returns false for file', async () => {
      const file = join(testDir, 'file.txt');
      await writeFile(file, 'content');

      const result = await isDirectory(file);
      expect(result).toBe(false);
    });

    it('returns false for non-existent path', async () => {
      const result = await isDirectory(join(testDir, 'nonexistent'));
      expect(result).toBe(false);
    });
  });

  describe('isFile', () => {
    it('returns true for file', async () => {
      const file = join(testDir, 'file.txt');
      await writeFile(file, 'content');

      const result = await isFile(file);
      expect(result).toBe(true);
    });

    it('returns false for directory', async () => {
      const dir = join(testDir, 'subdir');
      await mkdir(dir);

      const result = await isFile(dir);
      expect(result).toBe(false);
    });

    it('returns false for non-existent path', async () => {
      const result = await isFile(join(testDir, 'nonexistent.txt'));
      expect(result).toBe(false);
    });
  });

  describe('safeRenameWithSuffix', () => {
    it('renames file when target does not exist', async () => {
      const oldPath = join(testDir, 'old.txt');
      const newPath = join(testDir, 'new.txt');
      await writeFile(oldPath, 'content');

      const result = await safeRenameWithSuffix(oldPath, newPath);

      expect(result).toBe(newPath);
      expect(await fileExists(newPath)).toBe(true);
      expect(await fileExists(oldPath)).toBe(false);
    });

    it('adds suffix when target exists', async () => {
      const oldPath = join(testDir, 'old.txt');
      const newPath = join(testDir, 'new.txt');
      await writeFile(oldPath, 'old content');
      await writeFile(newPath, 'existing content');

      const result = await safeRenameWithSuffix(oldPath, newPath);

      expect(result).toContain('new-1.txt');
      expect(await fileExists(result)).toBe(true);
      expect(await fileExists(oldPath)).toBe(false);
    });

    it('increments suffix for multiple conflicts', async () => {
      const oldPath1 = join(testDir, 'old1.txt');
      const oldPath2 = join(testDir, 'old2.txt');
      const oldPath3 = join(testDir, 'old3.txt');
      const newPath = join(testDir, 'new.txt');

      await writeFile(oldPath1, 'content1');
      await writeFile(oldPath2, 'content2');
      await writeFile(oldPath3, 'content3');

      const result1 = await safeRenameWithSuffix(oldPath1, newPath);
      const result2 = await safeRenameWithSuffix(oldPath2, newPath);
      const result3 = await safeRenameWithSuffix(oldPath3, newPath);

      expect(result1).toBe(newPath);
      expect(result2).toContain('new-1.txt');
      expect(result3).toContain('new-2.txt');
    });

    it('handles files without extension', async () => {
      const oldPath = join(testDir, 'oldfile');
      const newPath = join(testDir, 'newfile');
      await writeFile(oldPath, 'content');
      await writeFile(newPath, 'existing');

      const result = await safeRenameWithSuffix(oldPath, newPath);

      expect(result).toContain('newfile-1');
      expect(await fileExists(result)).toBe(true);
    });

    it('preserves file extension', async () => {
      const oldPath = join(testDir, 'old.json');
      const newPath = join(testDir, 'new.json');
      await writeFile(oldPath, '{}');
      await writeFile(newPath, '{}');

      const result = await safeRenameWithSuffix(oldPath, newPath);

      expect(result).toMatch(/new-\d+\.json$/);
    });
  });

  describe('atomicRename', () => {
    it('renames file atomically', async () => {
      const src = join(testDir, 'source.txt');
      const dest = join(testDir, 'dest.txt');
      await writeFile(src, 'test content');

      await atomicRename(src, dest);

      expect(await fileExists(dest)).toBe(true);
      expect(await fileExists(src)).toBe(false);
      const content = await readFile(dest, 'utf-8');
      expect(content).toBe('test content');
    });

    it('overwrites existing destination', async () => {
      const src = join(testDir, 'source.txt');
      const dest = join(testDir, 'dest.txt');
      await writeFile(src, 'new content');
      await writeFile(dest, 'old content');

      await atomicRename(src, dest);

      const content = await readFile(dest, 'utf-8');
      expect(content).toBe('new content');
    });

    it('throws error for non-existent source', async () => {
      const src = join(testDir, 'nonexistent.txt');
      const dest = join(testDir, 'dest.txt');

      await expect(atomicRename(src, dest)).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles paths with special characters', async () => {
      const src = join(testDir, 'file with spaces.txt');
      const dest = join(testDir, 'dest with spaces.txt');
      await writeFile(src, 'content');

      await atomicRename(src, dest);

      expect(await fileExists(dest)).toBe(true);
    });

    it('handles unicode filenames', async () => {
      const src = join(testDir, '测试文件.txt');
      const dest = join(testDir, '目标文件.txt');
      await writeFile(src, 'unicode content');

      await atomicRename(src, dest);

      expect(await fileExists(dest)).toBe(true);
    });

    it('handles large files', async () => {
      const file = join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      await writeFile(file, largeContent);

      const size = await getFileSize(file);
      expect(size).toBe(1024 * 1024);
    });
  });
});
