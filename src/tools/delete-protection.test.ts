import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeDelete } from './FileSystemTool.js';

/**
 * PROTECTED_PATHS enforcement for Delete.
 *
 * Two bugs are guarded against here:
 *
 * 1. `isProtectedPath` compared for **equality only**, so `/etc` was refused
 *    but `/etc/passwd` and `C:\Windows\System32\drivers\etc\hosts` were
 *    deletable — the guard protected the directory entry and left its contents
 *    exposed.
 * 2. The protection check ran **after** the existence check, so a protected
 *    path that happens not to exist on the current platform took the
 *    `force=true` early return and was never evaluated.
 */
describe('FileSystemTool delete protection', () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'cy-del-prot-'));
    delete process.env['CODEX_SANDBOX'];
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  // ── Bug 1: subtree coverage ──
  describe('protected paths cover their whole subtree', () => {
    it.each([
      'C:\\Windows',
      'C:\\Windows\\System32',
      'C:\\Windows\\System32\\drivers\\etc\\hosts',
      'C:\\Program Files',
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\ProgramData\\Microsoft',
    ])('refuses %s', async (target) => {
      await expect(executeDelete(target, true, false)).rejects.toThrow(/protected system path/i);
    });

    it('refuses the filesystem roots', async () => {
      await expect(executeDelete('C:\\', true, false)).rejects.toThrow(/protected system path/i);
    });
  });

  // ── Bug 2: check order ──
  describe('protection is evaluated before the existence check', () => {
    it('refuses a protected path that does not exist, even with force=true', async () => {
      // This is exactly how `/etc/passwd` behaved on Windows: the path is
      // translated, does not exist, and `force` used to skip the guard.
      await expect(executeDelete('C:\\Windows\\System32\\definitely-not-here.dll', true, true)).rejects.toThrow(
        /protected system path/i,
      );
    });
  });

  // ── Must not over-block: ordinary project cleanup has to work ──
  describe('ordinary project paths stay deletable', () => {
    it('deletes node_modules', async () => {
      const nm = join(work, 'node_modules');
      mkdirSync(join(nm, 'pkg'), { recursive: true });
      writeFileSync(join(nm, 'pkg', 'index.js'), 'x');

      await expect(executeDelete(nm, true, false)).resolves.toContain('Deleted');
      expect(existsSync(nm)).toBe(false);
    });

    it('deletes dist', async () => {
      const dist = join(work, 'dist');
      mkdirSync(dist);
      writeFileSync(join(dist, 'a.js'), 'a');

      await expect(executeDelete(dist, true, false)).resolves.toContain('Deleted');
      expect(existsSync(dist)).toBe(false);
    });

    it('deletes a plain file', async () => {
      const f = join(work, 'notes.txt');
      writeFileSync(f, 'hello');

      await expect(executeDelete(f, false, false)).resolves.toContain('Deleted');
      expect(existsSync(f)).toBe(false);
    });
  });

  // ── Sandbox still applies first ──
  describe('sandbox is enforced independently of the protected list', () => {
    it('refuses any path outside CODEX_SANDBOX', async () => {
      const sandbox = mkdtempSync(join(tmpdir(), 'cy-del-sbx-'));
      process.env['CODEX_SANDBOX'] = sandbox;
      const outsideDir = mkdtempSync(join(tmpdir(), 'cy-del-out-'));
      const victim = join(outsideDir, 'keep.txt');
      writeFileSync(victim, 'keep');

      try {
        await expect(executeDelete(victim, false, false)).rejects.toThrow(/Path traversal blocked/i);
        expect(existsSync(victim)).toBe(true);
      } finally {
        delete process.env['CODEX_SANDBOX'];
        rmSync(sandbox, { recursive: true, force: true });
        rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
