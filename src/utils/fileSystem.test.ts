import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { safeRenameWithSuffix, fileExists, getFileSize, isDirectory, isFile } from './fileSystem.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('fileSystem utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `fs-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('safeRenameWithSuffix', () => {
    it('should rename file when target does not exist', async () => {
      const source = join(testDir, 'source.txt');
      const target = join(testDir, 'target.txt');
      await writeFile(source, 'content');

      const result = await safeRenameWithSuffix(source, target);

      expect(result).toBe(target);
      expect(await fileExists(target)).toBe(true);
      expect(await fileExists(source)).toBe(false);
    });

    it('should append suffix when target exists', async () => {
      const source = join(testDir, 'source.txt');
      const target = join(testDir, 'target.txt');
      await writeFile(source, 'content1');
      await writeFile(target, 'content2');

      const result = await safeRenameWithSuffix(source, target);

      expect(result).toBe(join(testDir, 'target-1.txt'));
      expect(await fileExists(join(testDir, 'target-1.txt'))).toBe(true);
      expect(await fileExists(target)).toBe(true); // Original still exists
    });

    it('should handle multiple conflicts', async () => {
      const source = join(testDir, 'source.txt');
      const target = join(testDir, 'target.txt');
      await writeFile(source, 'content');
      await writeFile(target, 'existing');
      await writeFile(join(testDir, 'target-1.txt'), 'existing1');

      const result = await safeRenameWithSuffix(source, target);

      expect(result).toBe(join(testDir, 'target-2.txt'));
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const file = join(testDir, 'exists.txt');
      await writeFile(file, 'content');

      expect(await fileExists(file)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      expect(await fileExists(join(testDir, 'nonexistent.txt'))).toBe(false);
    });
  });

  describe('getFileSize', () => {
    it('should return correct file size', async () => {
      const file = join(testDir, 'sized.txt');
      const content = 'Hello World!';
      await writeFile(file, content);

      const size = await getFileSize(file);

      expect(size).toBe(Buffer.byteLength(content));
    });
  });

  describe('isDirectory', () => {
    it('should return true for directory', async () => {
      expect(await isDirectory(testDir)).toBe(true);
    });

    it('should return false for file', async () => {
      const file = join(testDir, 'file.txt');
      await writeFile(file, 'content');

      expect(await isDirectory(file)).toBe(false);
    });

    it('should return false for non-existing path', async () => {
      expect(await isDirectory(join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('isFile', () => {
    it('should return true for file', async () => {
      const file = join(testDir, 'file.txt');
      await writeFile(file, 'content');

      expect(await isFile(file)).toBe(true);
    });

    it('should return false for directory', async () => {
      expect(await isFile(testDir)).toBe(false);
    });

    it('should return false for non-existing path', async () => {
      expect(await isFile(join(testDir, 'nonexistent.txt'))).toBe(false);
    });
  });
});
