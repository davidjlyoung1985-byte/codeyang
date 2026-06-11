import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeCopy, executeMove, executeDelete, executeMkdir, executeList, executeExists } from './FileSystemTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-fs-tools');

describe('FileSystemTool', () => {
  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('executeCopy', () => {
    it('should copy a file', async () => {
      const source = path.join(TEST_DIR, 'source.txt');
      const dest = path.join(TEST_DIR, 'dest.txt');

      await fs.writeFile(source, 'test content');
      const result = await executeCopy(source, dest);

      expect(result).toContain('Copied file');
      expect(existsSync(dest)).toBe(true);
      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('test content');
    });

    it('should copy a directory recursively', async () => {
      const sourceDir = path.join(TEST_DIR, 'source-dir');
      const destDir = path.join(TEST_DIR, 'dest-dir');

      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'content1');
      await fs.mkdir(path.join(sourceDir, 'subdir'));
      await fs.writeFile(path.join(sourceDir, 'subdir', 'file2.txt'), 'content2');

      const result = await executeCopy(sourceDir, destDir);

      expect(result).toContain('Copied directory');
      expect(existsSync(path.join(destDir, 'file1.txt'))).toBe(true);
      expect(existsSync(path.join(destDir, 'subdir', 'file2.txt'))).toBe(true);
    });

    it('should fail if destination exists without overwrite', async () => {
      const source = path.join(TEST_DIR, 'source.txt');
      const dest = path.join(TEST_DIR, 'dest.txt');

      await fs.writeFile(source, 'source');
      await fs.writeFile(dest, 'dest');

      await expect(executeCopy(source, dest, false)).rejects.toThrow('already exists');
    });

    it('should overwrite if overwrite=true', async () => {
      const source = path.join(TEST_DIR, 'source.txt');
      const dest = path.join(TEST_DIR, 'dest.txt');

      await fs.writeFile(source, 'new content');
      await fs.writeFile(dest, 'old content');

      const result = await executeCopy(source, dest, true);

      expect(result).toContain('Copied file');
      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('new content');
    });

    it('should prevent copying directory into itself', async () => {
      const sourceDir = path.join(TEST_DIR, 'source-dir');
      const destDir = path.join(sourceDir, 'dest-dir');

      await fs.mkdir(sourceDir);
      await expect(executeCopy(sourceDir, destDir)).rejects.toThrow('into itself');
    });
  });

  describe('executeMove', () => {
    it('should move a file', async () => {
      const source = path.join(TEST_DIR, 'source.txt');
      const dest = path.join(TEST_DIR, 'dest.txt');

      await fs.writeFile(source, 'test content');
      const result = await executeMove(source, dest);

      expect(result).toContain('Moved');
      expect(existsSync(source)).toBe(false);
      expect(existsSync(dest)).toBe(true);
      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('test content');
    });

    it('should rename a file', async () => {
      const source = path.join(TEST_DIR, 'oldname.txt');
      const dest = path.join(TEST_DIR, 'newname.txt');

      await fs.writeFile(source, 'content');
      const result = await executeMove(source, dest);

      expect(result).toContain('Moved');
      expect(existsSync(source)).toBe(false);
      expect(existsSync(dest)).toBe(true);
    });

    it('should move a directory', async () => {
      const sourceDir = path.join(TEST_DIR, 'source-dir');
      const destDir = path.join(TEST_DIR, 'dest-dir');

      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

      const result = await executeMove(sourceDir, destDir);

      expect(result).toContain('Moved');
      expect(existsSync(sourceDir)).toBe(false);
      expect(existsSync(path.join(destDir, 'file.txt'))).toBe(true);
    });
  });

  describe('executeDelete', () => {
    it('should delete a file', async () => {
      const file = path.join(TEST_DIR, 'file.txt');
      await fs.writeFile(file, 'content');

      const result = await executeDelete(file);

      expect(result).toContain('Deleted file');
      expect(existsSync(file)).toBe(false);
    });

    it('should delete an empty directory', async () => {
      const dir = path.join(TEST_DIR, 'empty-dir');
      await fs.mkdir(dir);

      const result = await executeDelete(dir, false);

      expect(result).toContain('Deleted directory');
      expect(existsSync(dir)).toBe(false);
    });

    it('should fail on non-empty directory without recursive', async () => {
      const dir = path.join(TEST_DIR, 'non-empty-dir');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'file.txt'), 'content');

      await expect(executeDelete(dir, false)).rejects.toThrow('not empty');
      expect(existsSync(dir)).toBe(true);
    });

    it('should delete non-empty directory with recursive=true', async () => {
      const dir = path.join(TEST_DIR, 'non-empty-dir');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'file.txt'), 'content');

      const result = await executeDelete(dir, true);

      expect(result).toContain('Deleted directory');
      expect(result).toContain('recursive');
      expect(existsSync(dir)).toBe(false);
    });

    it('should ignore missing path with force=true', async () => {
      const file = path.join(TEST_DIR, 'nonexistent.txt');

      const result = await executeDelete(file, false, true);

      expect(result).toContain('does not exist');
      expect(result).toContain('ignored');
    });
  });

  describe('executeMkdir', () => {
    it('should create a directory', async () => {
      const dir = path.join(TEST_DIR, 'new-dir');

      const result = await executeMkdir(dir);

      expect(result).toContain('Created directory');
      expect(existsSync(dir)).toBe(true);
    });

    it('should create parent directories by default', async () => {
      const dir = path.join(TEST_DIR, 'parent', 'child', 'grandchild');

      const result = await executeMkdir(dir);

      expect(result).toContain('Created directory');
      expect(result).toContain('with parents');
      expect(existsSync(dir)).toBe(true);
    });

    it('should return success if directory already exists', async () => {
      const dir = path.join(TEST_DIR, 'existing-dir');
      await fs.mkdir(dir);

      const result = await executeMkdir(dir);

      expect(result).toContain('already exists');
      expect(existsSync(dir)).toBe(true);
    });
  });

  describe('executeList', () => {
    it('should list directory contents', async () => {
      const dir = path.join(TEST_DIR, 'list-test');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'file1.txt'), '');
      await fs.writeFile(path.join(dir, 'file2.txt'), '');
      await fs.mkdir(path.join(dir, 'subdir'));

      const result = await executeList(dir);

      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
      expect(result).toContain('subdir/');
    });

    it('should hide hidden files by default', async () => {
      const dir = path.join(TEST_DIR, 'hidden-test');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'visible.txt'), '');
      await fs.writeFile(path.join(dir, '.hidden'), '');

      const result = await executeList(dir, false);

      expect(result).toContain('visible.txt');
      expect(result).not.toContain('.hidden');
    });

    it('should show hidden files with showHidden=true', async () => {
      const dir = path.join(TEST_DIR, 'hidden-test');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'visible.txt'), '');
      await fs.writeFile(path.join(dir, '.hidden'), '');

      const result = await executeList(dir, true);

      expect(result).toContain('visible.txt');
      expect(result).toContain('.hidden');
    });

    it('should show detailed information with details=true', async () => {
      const dir = path.join(TEST_DIR, 'details-test');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'file.txt'), 'test content');

      const result = await executeList(dir, false, true);

      expect(result).toContain('FILE');
      expect(result).toContain('file.txt');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}/); // Date format
    });
  });

  describe('executeExists', () => {
    it('should confirm file exists', async () => {
      const file = path.join(TEST_DIR, 'exists.txt');
      await fs.writeFile(file, 'content');

      const result = await executeExists(file);

      expect(result).toContain('Path exists');
      expect(result).toContain('Type: file');
    });

    it('should confirm directory exists', async () => {
      const dir = path.join(TEST_DIR, 'exists-dir');
      await fs.mkdir(dir);

      const result = await executeExists(dir);

      expect(result).toContain('Path exists');
      expect(result).toContain('Type: directory');
    });

    it('should report non-existent path', async () => {
      const file = path.join(TEST_DIR, 'nonexistent.txt');

      const result = await executeExists(file);

      expect(result).toContain('does not exist');
    });
  });
});
