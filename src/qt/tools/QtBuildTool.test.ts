import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeQtBuild } from './QtBuildTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-build-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  try { await rm(tempDir, { recursive: true, force: true }); } catch {}
  // Retry once on Windows (EBUSY from anti-virus indexing temp dirs)
  try { await rm(tempDir, { recursive: true, force: true }); } catch {}
});

async function createFile(name: string, content: string): Promise<string> {
  const p = join(tempDir, name);
  try {
    await mkdir(dirname(p), { recursive: true });
  } catch {}
  await writeFile(p, content, 'utf-8');
  return p;
}

// ──────────────────────────────────────────────
// QtBuild Tool — build system execution
// Note: These tests verify graceful handling when
// qmake/cmake are not installed in the test environment.
// ──────────────────────────────────────────────

describe('QtBuildTool', () => {
  describe('qmake mode', () => {
    it('handles qmake not being installed gracefully', async () => {
      // qmake will not be found in test environment
      const r = await executeQtBuild('qmake', '', tempDir);
      expect(r).toContain('Qt Build (qmake)');
      // Either "not found" or any other graceful message
      expect(r.length).toBeGreaterThan(0);
    });

    it('reports qmake build header', async () => {
      const r = await executeQtBuild('qmake', 'myapp', tempDir);
      expect(r).toContain('Qt Build (qmake)');
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
