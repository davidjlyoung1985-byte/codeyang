import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeCopy, executeMove, executeDelete, executeMkdir, executeList, executeExists } from './FileSystemTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-fs-tools');

describe('FileSystemTool', () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('executeCopy', () => {
    it('copies a file', async () => {
      const src = path.join(TEST_DIR, 'src.txt');
      const dst = path.join(TEST_DIR, 'dst.txt');
      await fs.writeFile(src, 'test');
      expect(await executeCopy(src, dst)).toContain('Copied file');
      expect(existsSync(dst)).toBe(true);
    });

    it('copies directory recursively', async () => {
      const srcDir = path.join(TEST_DIR, 'src');
      const dstDir = path.join(TEST_DIR, 'dst');
      await fs.mkdir(path.join(srcDir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(srcDir, 'a.txt'), 'a');
      await fs.writeFile(path.join(srcDir, 'sub', 'b.txt'), 'b');
      expect(await executeCopy(srcDir, dstDir)).toContain('Copied directory');
      expect(existsSync(path.join(dstDir, 'sub', 'b.txt'))).toBe(true);
    });

    it('rejects copy into self', async () => {
      const d = path.join(TEST_DIR, 'd');
      await fs.mkdir(d);
      await expect(executeCopy(d, path.join(d, 'self'))).rejects.toThrow('into itself');
    });

    it('rejects overwrite without flag', async () => {
      const f = path.join(TEST_DIR, 'f.txt');
      await fs.writeFile(f, 'v1');
      await expect(executeCopy(f, f)).rejects.toThrow('same');
    });
  });

  describe('executeMove', () => {
    it('moves a file', async () => {
      const src = path.join(TEST_DIR, 'old.txt');
      const dst = path.join(TEST_DIR, 'new.txt');
      await fs.writeFile(src, 'data');
      await executeMove(src, dst);
      expect(existsSync(src)).toBe(false);
      expect(existsSync(dst)).toBe(true);
    });

    it('moves a directory', async () => {
      const src = path.join(TEST_DIR, 'old');
      const dst = path.join(TEST_DIR, 'new');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'f.txt'), 'x');
      await executeMove(src, dst);
      expect(existsSync(src)).toBe(false);
      expect(existsSync(path.join(dst, 'f.txt'))).toBe(true);
    });
  });

  describe('executeDelete', () => {
    it('deletes a file', async () => {
      const f = path.join(TEST_DIR, 'f.txt');
      await fs.writeFile(f, 'x');
      expect(await executeDelete(f)).toContain('Deleted file');
      expect(existsSync(f)).toBe(false);
    });

    it('rejects delete non-empty dir without recursive', async () => {
      const d = path.join(TEST_DIR, 'd');
      await fs.mkdir(d);
      await fs.writeFile(path.join(d, 'f.txt'), 'x');
      await expect(executeDelete(d)).rejects.toThrow('not empty');
    });

    it('deletes non-empty dir with recursive', async () => {
      const d = path.join(TEST_DIR, 'd');
      await fs.mkdir(d);
      await fs.writeFile(path.join(d, 'f.txt'), 'x');
      expect(await executeDelete(d, true)).toContain('recursive');
      expect(existsSync(d)).toBe(false);
    });

    it('force=true ignores missing path', async () => {
      expect(await executeDelete(path.join(TEST_DIR, 'nope'), false, true)).toContain('ignored');
    });
  });

  describe('executeMkdir', () => {
    it('creates a directory', async () => {
      const d = path.join(TEST_DIR, 'new');
      expect(await executeMkdir(d)).toContain('Created');
      expect(existsSync(d)).toBe(true);
    });

    it('creates parent directories', async () => {
      const d = path.join(TEST_DIR, 'a', 'b', 'c');
      await executeMkdir(d);
      expect(existsSync(d)).toBe(true);
    });

    it('reports already exists', async () => {
      const d = path.join(TEST_DIR, 'ex');
      await fs.mkdir(d);
      expect(await executeMkdir(d)).toContain('already exists');
    });
  });

  describe('executeList', () => {
    it('lists contents', async () => {
      const d = path.join(TEST_DIR, 'ls');
      await fs.mkdir(d);
      await fs.writeFile(path.join(d, 'a.txt'), '');
      await fs.mkdir(path.join(d, 'sub'));
      expect(await executeList(d)).toContain('a.txt');
      expect(await executeList(d)).toContain('sub/');
    });

    it('hides dotfiles by default', async () => {
      const d = path.join(TEST_DIR, 'h');
      await fs.mkdir(d);
      await fs.writeFile(path.join(d, '.secret'), '');
      await fs.writeFile(path.join(d, 'visible'), '');
      expect(await executeList(d)).not.toContain('.secret');
    });

    it('shows dotfiles with flag', async () => {
      const d = path.join(TEST_DIR, 'h');
      await fs.mkdir(d);
      await fs.writeFile(path.join(d, '.secret'), '');
      expect(await executeList(d, true)).toContain('.secret');
    });
  });

  describe('executeExists', () => {
    it('confirms file exists', async () => {
      const f = path.join(TEST_DIR, 'ex.txt');
      await fs.writeFile(f, 'x');
      expect(await executeExists(f)).toContain('Path exists');
    });

    it('reports non-existent', async () => {
      expect(await executeExists(path.join(TEST_DIR, 'nope'))).toContain('does not exist');
    });
  });
});
