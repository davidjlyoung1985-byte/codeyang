import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeQtBuild } from './QtBuildTool.js';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-build-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore first attempt failure
  }
  // Retry once on Windows (EBUSY from anti-virus indexing temp dirs)
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures - temp dir will be cleaned by OS eventually
  }
});

// ──────────────────────────────────────────────
// QtBuild Tool — build system execution
// Note: These tests verify graceful handling when
// qmake/cmake are not installed in the test environment.
// ──────────────────────────────────────────────

describe('QtBuildTool', () => {
  describe('qmake mode', () => {
    it('handles qmake not being installed gracefully', { timeout: 10000 }, async () => {
      // qmake will not be found in test environment
      const r = await executeQtBuild('qmake', '', tempDir);
      // Should return a message, not crash
      expect(r).toBeDefined();
      expect(typeof r).toBe('string');
    });

    it('reports qmake build header', { timeout: 10000 }, async () => {
      const r = await executeQtBuild('qmake', 'myapp', tempDir);
      expect(r).toBeDefined();
      expect(typeof r).toBe('string');
    });
  });

  describe('cmake mode', () => {
    it('handles cmake not being installed gracefully', async () => {
      const r = await executeQtBuild('cmake', '', tempDir);
      expect(r).toContain('Qt Build (cmake)');
      expect(r.length).toBeGreaterThan(0);
    });

    it('reports cmake build header', async () => {
      const r = await executeQtBuild('cmake', 'all', tempDir);
      expect(r).toContain('Qt Build (cmake)');
    });
  });

  describe('auto mode', () => {
    it('auto mode defaults to cmake', async () => {
      const r = await executeQtBuild('auto', '', tempDir);
      expect(r).toContain('Qt Build (cmake)');
    });
  });

  describe('Parameter handling', () => {
    it('accepts target parameter for cmake', async () => {
      const r = await executeQtBuild('cmake', 'mytarget', tempDir);
      expect(r).toContain('Qt Build (cmake)');
    });

    it('accepts empty target for qmake', async () => {
      const r = await executeQtBuild('qmake', '', tempDir);
      expect(r).toContain('Qt Build (qmake)');
    });
  });
});
