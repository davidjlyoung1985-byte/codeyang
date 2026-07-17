import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeQtBuild } from './QtBuildTool.js';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Mock execa to avoid actually running qmake/cmake
vi.mock('execa', () => ({
  execa: vi.fn(async (command: string, args?: string[]) => {
    // Simulate successful command execution
    if (command === 'qmake') {
      return {
        exitCode: 0,
        stdout: 'qmake output',
        stderr: '',
      };
    }
    if (command === 'cmake') {
      return {
        exitCode: 0,
        stdout: 'cmake build output',
        stderr: '',
      };
    }
    if (command === 'make' || command === 'nmake') {
      return {
        exitCode: 0,
        stdout: 'Build successful\n[100%] Built target myapp',
        stderr: '',
      };
    }
    // Default: command not found
    throw new Error(`Command not found: ${command}`);
  }),
}));

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
// Note: These tests use mocked execa to avoid
// requiring actual qmake/cmake installation.
// ──────────────────────────────────────────────

describe('QtBuildTool', () => {
  describe('qmake mode', () => {
    it('handles qmake execution gracefully', async () => {
      const r = await executeQtBuild('qmake', '', tempDir);
      expect(r).toBeDefined();
      expect(typeof r).toBe('string');
      expect(r).toContain('Qt Build (qmake)');
    });

    it('reports qmake build header', async () => {
      const r = await executeQtBuild('qmake', 'myapp', tempDir);
      expect(r).toBeDefined();
      expect(typeof r).toBe('string');
      expect(r).toContain('Qt Build (qmake)');
    });
  });

  describe('cmake mode', () => {
    it('handles cmake execution gracefully', async () => {
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
