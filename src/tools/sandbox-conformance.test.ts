import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeGrep } from './GrepTool.js';
import { executeGlob } from './GlobTool.js';
import { executeRead } from './ReadTool.js';
import { executeWrite } from './WriteTool.js';

/**
 * Sandbox conformance for the read-only search tools.
 *
 * Regression guard: `executeGrep` and `executeGlob` used to build their base
 * path with a bare `join(process.cwd(), path)` and never called
 * `resolveSafePath`. `executeRead` and `executeWrite` did. The result was a
 * one-way hole — a sandboxed session could not *write* outside CODEX_SANDBOX
 * but could freely *grep* and *glob* it, including `~/.ssh`.
 */
describe('search tools respect CODEX_SANDBOX', () => {
  let sandbox: string;
  let outside: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cy-sbx-in-'));
    outside = mkdtempSync(join(tmpdir(), 'cy-sbx-out-'));
    writeFileSync(join(sandbox, 'inside.txt'), 'INSIDE_MARKER');
    writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE_MARKER');
    process.env['CODEX_SANDBOX'] = sandbox;
  });

  afterEach(() => {
    delete process.env['CODEX_SANDBOX'];
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  describe('executeGrep', () => {
    it('refuses a path outside the sandbox', async () => {
      await expect(executeGrep('OUTSIDE_MARKER', undefined, outside)).rejects.toThrow(/Path traversal blocked/i);
    });

    it('refuses a relative path that escapes the sandbox', async () => {
      await expect(executeGrep('x', undefined, '..')).rejects.toThrow(/Path traversal blocked/i);
    });

    it('still searches inside the sandbox', async () => {
      const result = await executeGrep('INSIDE_MARKER', undefined, sandbox);
      expect(result).toContain('INSIDE_MARKER');
      expect(result).toContain('inside.txt');
    });

    it('does not leak outside content in any form', async () => {
      // Even the error text must not include the leaked file's contents.
      await expect(executeGrep('OUTSIDE_MARKER', undefined, outside)).rejects.not.toThrow(/OUTSIDE_MARKER/);
    });
  });

  describe('executeGlob', () => {
    it('refuses a root outside the sandbox', async () => {
      await expect(executeGlob('*.txt', outside)).rejects.toThrow(/Path traversal blocked/i);
    });

    it('still lists inside the sandbox', async () => {
      const result = await executeGlob('*.txt', sandbox);
      expect(result).toContain('inside.txt');
    });

    it('surfaces the refusal as an error, not an "Error:" string', async () => {
      // Returning `Error: ...` would let the model treat a blocked path as an
      // ordinary empty result and retry elsewhere.
      const result = executeGlob('*.txt', outside);
      await expect(result).rejects.toThrow();
    });

    it('caps runaway recursion depth', async () => {
      let dir = sandbox;
      for (let i = 0; i < 30; i++) {
        dir = join(dir, `d${i}`);
        mkdirSync(dir);
      }
      writeFileSync(join(dir, 'deep.txt'), 'deep');

      const result = await executeGlob('**/*.txt', sandbox);
      // No hang, no crash — it just stops at the depth limit.
      expect(typeof result).toBe('string');
    });
  });

  // The tools that already did this correctly, kept here so the four stay in
  // lockstep: adding a new path-taking tool without `resolveSafePath` will show
  // up as an inconsistency against this group.
  describe('parity with executeRead / executeWrite', () => {
    it('executeRead also refuses outside paths', async () => {
      await expect(executeRead(join(outside, 'secret.txt'))).rejects.toThrow(/Path traversal blocked/i);
    });

    it('executeWrite also refuses outside paths', async () => {
      await expect(executeWrite(join(outside, 'new.txt'), 'x')).rejects.toThrow(/Path traversal blocked/i);
    });

    it('all four reject the same path', async () => {
      const target = join(outside, 'secret.txt');
      const results = await Promise.allSettled([
        executeRead(target),
        executeWrite(target, 'x'),
        executeGrep('x', undefined, target),
        executeGlob('*.txt', outside),
      ]);
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
    });
  });
});
