import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPathViolations, isPathArgName, formatPathViolations } from './pathGuard.js';
import { tools } from './registry.js';

/**
 * Centralised path guard.
 *
 * The guard exists because five tools forgot to call `resolveSafePath`
 * (GrepTool, GlobTool, CodeAnalysisTool x6, SearchTool) and therefore read
 * files outside CODEX_SANDBOX. Enforcing it in `registry.ts#validatedExecute`
 * — through which every built-in call already passes — means a tool cannot
 * forget, regardless of how it is implemented.
 */
describe('pathGuard', () => {
  let sandbox: string;
  let outside: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cy-pg-in-'));
    outside = mkdtempSync(join(tmpdir(), 'cy-pg-out-'));
    process.env['CODEX_SANDBOX'] = sandbox;
  });

  afterEach(() => {
    delete process.env['CODEX_SANDBOX'];
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  describe('argument name classification', () => {
    it.each(['path', 'filePath', 'cwd', 'root', 'rootDir', 'source', 'destination', 'target', 'dir'])(
      'treats %s as a path',
      (name) => {
        expect(isPathArgName(name)).toBe(true);
      },
    );

    it.each(['include', 'query', 'pattern', 'url', 'command', 'content', 'message'])(
      'does not treat %s as a path',
      (name) => {
        expect(isPathArgName(name)).toBe(false);
      },
    );
  });

  describe('violation detection', () => {
    it('flags a path outside the sandbox', () => {
      const v = findPathViolations('Read', { filePath: join(outside, 'x.txt') });
      expect(v).toHaveLength(1);
      expect(v[0].argName).toBe('filePath');
    });

    it('allows a path inside the sandbox', () => {
      expect(findPathViolations('Read', { filePath: join(sandbox, 'x.txt') })).toHaveLength(0);
    });

    it('checks every path-like argument, not just the first', () => {
      const v = findPathViolations('Copy', {
        source: join(outside, 'a.txt'),
        destination: join(outside, 'b.txt'),
      });
      expect(v).toHaveLength(2);
    });

    it('ignores non-string and empty values', () => {
      expect(findPathViolations('Read', { filePath: 123 })).toHaveLength(0);
      expect(findPathViolations('Read', { filePath: '' })).toHaveLength(0);
    });

    it('ignores arguments that are not path-like', () => {
      expect(findPathViolations('Grep', { pattern: '/etc/passwd', path: sandbox })).toHaveLength(0);
    });

    // These take a URL, an app name or free text — resolving them as paths
    // would break them, and they have their own controls.
    it.each(['LaunchApp', 'WebFetch', 'WebSearch'])('exempts %s from path resolution', (tool) => {
      expect(findPathViolations(tool, { path: 'C:\\Windows\\notepad.exe' })).toHaveLength(0);
    });
  });

  describe('refusal message', () => {
    it('reads as a hard refusal, not a retryable error', () => {
      const v = findPathViolations('Read', { filePath: join(outside, 'x.txt') });
      const msg = formatPathViolations('Read', v);
      expect(msg).toContain('[SECURITY]');
      expect(msg).toContain('Read');
      expect(msg).toMatch(/do not retry/i);
    });
  });

  // ── The property that matters: it applies through the registry ──
  //
  // Testing the helper alone would not prove the guard is actually wired in.
  // This exercises the same entry point the agent uses.
  describe('enforced through the registry', () => {
    function findTool(name: string) {
      return (tools as { name: string; execute: (a: Record<string, unknown>) => Promise<string> }[]).find(
        (t) => t.name === name,
      );
    }

    it('Read refuses an outside path', async () => {
      const read = findTool('Read');
      expect(read).toBeDefined();
      const result = await read!.execute({ filePath: join(outside, 'secret.txt') });
      expect(result).toContain('[SECURITY]');
    });

    it('Grep refuses an outside root', async () => {
      const grep = findTool('Grep');
      expect(grep).toBeDefined();
      const result = await grep!.execute({ pattern: 'x', path: outside });
      expect(result).toContain('[SECURITY]');
    });

    it('Glob refuses an outside root', async () => {
      const glob = findTool('Glob');
      expect(glob).toBeDefined();
      const result = await glob!.execute({ pattern: '*', root: outside });
      expect(result).toContain('[SECURITY]');
    });

    it('still executes normally inside the sandbox', async () => {
      const inFile = join(sandbox, 'ok.txt');
      writeFileSync(inFile, 'INSIDE_CONTENT');
      const read = findTool('Read');
      const result = await read!.execute({ filePath: inFile });
      expect(result).toContain('INSIDE_CONTENT');
    });
  });
});
