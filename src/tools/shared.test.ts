import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveSafePath, resolveSafePathAsync } from './shared.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('shared - resolveSafePath', () => {
  let testDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create test directory
    testDir = path.join(tmpdir(), `codeyang-shared-test-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('without sandbox', () => {
    it('should resolve absolute path', () => {
      delete process.env['CODEX_SANDBOX'];

      const result = resolveSafePath('/test/path');

      expect(result).toBe(path.resolve('/test/path'));
    });

    it('should resolve relative path', () => {
      delete process.env['CODEX_SANDBOX'];

      const result = resolveSafePath('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should use process.cwd() when no cwd provided', () => {
      delete process.env['CODEX_SANDBOX'];

      const result = resolveSafePath('test.txt');

      expect(result).toBe(path.resolve(process.cwd(), 'test.txt'));
    });
  });

  describe('with sandbox', () => {
    beforeEach(() => {
      process.env['CODEX_SANDBOX'] = testDir;
    });

    it('should allow path inside sandbox', () => {
      const result = resolveSafePath('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should allow path equal to sandbox', () => {
      const result = resolveSafePath('.', testDir);

      expect(result).toBe(testDir);
    });

    it('should block path outside sandbox', () => {
      expect(() => {
        resolveSafePath('../outside.txt', testDir);
      }).toThrow(/Path traversal blocked/);
    });

    it('should block absolute path outside sandbox', () => {
      const outsidePath = path.join(tmpdir(), 'outside.txt');

      expect(() => {
        resolveSafePath(outsidePath, testDir);
      }).toThrow(/Path traversal blocked/);
    });

    it('should handle non-existent sandbox directory', () => {
      const nonExistentSandbox = path.join(testDir, 'does-not-exist');
      process.env['CODEX_SANDBOX'] = nonExistentSandbox;

      // Should not throw for paths inside non-existent sandbox
      const result = resolveSafePath('test.txt', nonExistentSandbox);

      expect(result).toBe(path.join(nonExistentSandbox, 'test.txt'));
    });

    it('should handle non-existent target path', () => {
      const result = resolveSafePath('non-existent.txt', testDir);

      expect(result).toBe(path.join(testDir, 'non-existent.txt'));
    });
  });

  describe('with drive whitelist (Windows)', () => {
    beforeEach(() => {
      process.env['CODEX_SANDBOX'] = testDir;
    });

    it('should allow whitelisted drive inside sandbox', () => {
      const driveLetter = testDir.charAt(0).toUpperCase();
      process.env['CODEYANG_ALLOW_DRIVES'] = driveLetter;

      const result = resolveSafePath('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should block whitelisted drive outside sandbox', () => {
      const driveLetter = testDir.charAt(0).toUpperCase();
      process.env['CODEYANG_ALLOW_DRIVES'] = driveLetter;

      expect(() => {
        resolveSafePath('../outside.txt', testDir);
      }).toThrow(/Path traversal blocked.*outside sandbox/);
    });

    it('should handle multiple whitelisted drives', () => {
      process.env['CODEYANG_ALLOW_DRIVES'] = 'C,D,E';

      const result = resolveSafePath('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should handle drives with colons', () => {
      process.env['CODEYANG_ALLOW_DRIVES'] = 'C:,D:,E:';

      const result = resolveSafePath('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should handle empty drive whitelist', () => {
      process.env['CODEYANG_ALLOW_DRIVES'] = ',,';

      const result = resolveSafePath('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should trim whitespace in drive list', () => {
      process.env['CODEYANG_ALLOW_DRIVES'] = ' C , D , E ';

      const result = resolveSafePath('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });
  });

  describe('symlink handling', () => {
    it('should resolve symlinks in existing paths', async () => {
      process.env['CODEX_SANDBOX'] = testDir;

      const targetFile = path.join(testDir, 'target.txt');
      const linkFile = path.join(testDir, 'link.txt');

      await fs.writeFile(targetFile, 'content');

      try {
        await fs.symlink(targetFile, linkFile);

        const result = resolveSafePath(linkFile, testDir);

        expect(result).toBeDefined();
      } catch (err) {
        // Skip test if symlinks not supported
        if ((err as NodeJS.ErrnoException).code === 'EPERM') {
          return;
        }
        throw err;
      }
    });
  });
});

describe('shared - resolveSafePathAsync', () => {
  let testDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    testDir = path.join(tmpdir(), `codeyang-shared-async-test-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    process.env = originalEnv;
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('without sandbox', () => {
    it('should resolve absolute path', async () => {
      delete process.env['CODEX_SANDBOX'];

      const result = await resolveSafePathAsync('/test/path');

      expect(result).toBe(path.resolve('/test/path'));
    });

    it('should resolve relative path', async () => {
      delete process.env['CODEX_SANDBOX'];

      const result = await resolveSafePathAsync('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });
  });

  describe('with sandbox', () => {
    beforeEach(() => {
      process.env['CODEX_SANDBOX'] = testDir;
    });

    it('should allow path inside sandbox', async () => {
      const result = await resolveSafePathAsync('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should block path outside sandbox', async () => {
      await expect(async () => {
        await resolveSafePathAsync('../outside.txt', testDir);
      }).rejects.toThrow(/Path traversal blocked/);
    });

    it('should handle non-existent sandbox directory', async () => {
      const nonExistentSandbox = path.join(testDir, 'does-not-exist');
      process.env['CODEX_SANDBOX'] = nonExistentSandbox;

      const result = await resolveSafePathAsync('test.txt', nonExistentSandbox);

      expect(result).toBe(path.join(nonExistentSandbox, 'test.txt'));
    });
  });

  describe('with drive whitelist', () => {
    beforeEach(() => {
      process.env['CODEX_SANDBOX'] = testDir;
    });

    it('should allow whitelisted drive inside sandbox', async () => {
      const driveLetter = testDir.charAt(0).toUpperCase();
      process.env['CODEYANG_ALLOW_DRIVES'] = driveLetter;

      const result = await resolveSafePathAsync('test.txt', testDir);

      expect(result).toBe(path.join(testDir, 'test.txt'));
    });

    it('should block whitelisted drive outside sandbox', async () => {
      const driveLetter = testDir.charAt(0).toUpperCase();
      process.env['CODEYANG_ALLOW_DRIVES'] = driveLetter;

      await expect(async () => {
        await resolveSafePathAsync('../outside.txt', testDir);
      }).rejects.toThrow(/Path traversal blocked.*outside sandbox/);
    });
  });
});
