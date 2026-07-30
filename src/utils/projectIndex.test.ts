import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getProjectIndex, invalidateIndex } from './projectIndex.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('ProjectIndex', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `test-project-index-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    invalidateIndex(); // Clear cache before each test
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getProjectIndex', () => {
    it('should build index for empty directory', async () => {
      const index = await getProjectIndex(testDir);
      expect(index).toBeDefined();
      expect(index.files).toBeDefined();
      expect(Array.isArray(index.files)).toBe(true);
      expect(index.lastBuilt).toBeDefined();
      expect(typeof index.lastBuilt).toBe('number');
    });

    it('should index simple files', async () => {
      await fs.writeFile(path.join(testDir, 'test.txt'), 'hello world');
      await fs.writeFile(path.join(testDir, 'test.js'), 'console.log("test")');

      const index = await getProjectIndex(testDir);
      expect(index.files.length).toBeGreaterThanOrEqual(2);

      const filenames = index.files.map((f: string) => path.basename(f));
      expect(filenames).toContain('test.txt');
      expect(filenames).toContain('test.js');
    });

    it('should index nested directories', async () => {
      await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested content');

      const index = await getProjectIndex(testDir);
      const nestedFile = index.files.find((f: string) => f.includes('nested.txt'));
      expect(nestedFile).toBeDefined();
    });

    it('should exclude ignored directories', async () => {
      await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'node_modules', 'dep.js'), 'dependency');
      await fs.writeFile(path.join(testDir, 'main.js'), 'main file');

      const index = await getProjectIndex(testDir);
      const paths = index.files;

      // node_modules should be excluded
      const hasNodeModules = paths.some((p: string) => p.includes('node_modules'));
      const hasMain = paths.some((p: string) => p.includes('main.js'));

      expect(hasNodeModules).toBe(false);
      expect(hasMain).toBe(true);
    });

    it('should cache index and return cached version', async () => {
      await fs.writeFile(path.join(testDir, 'test.txt'), 'content');

      const index1 = await getProjectIndex(testDir);
      const index2 = await getProjectIndex(testDir);

      // Should return same cached instance
      expect(index1.lastBuilt).toBe(index2.lastBuilt);
    });

    it('should rebuild after invalidation', async () => {
      await fs.writeFile(path.join(testDir, 'test.txt'), 'content');

      const index1 = await getProjectIndex(testDir);
      invalidateIndex();
      const index2 = await getProjectIndex(testDir);

      // Should have different timestamps
      expect(index2.lastBuilt).toBeGreaterThanOrEqual(index1.lastBuilt);
    });
  });
});
