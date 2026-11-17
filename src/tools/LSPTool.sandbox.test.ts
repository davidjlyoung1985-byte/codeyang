import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { executeLsp } from './LSPTool.js';

/**
 * LSPTool path containment.
 *
 * `readFileContent` used to call `readFile(join(root, filePath))` directly, so a
 * relative path above the working root (`../x.ts`) was read without complaint.
 *
 * ── On assertions ──
 * The first version of this test asserted `not.toContain('LEAKED')` on the
 * result of `diagnostics`, which only reports lint findings and never echoes
 * file content — so the assertion passed whether or not the file was read.
 * Mutation testing caught it: removing `resolveSafePath` still left 3/3 green.
 *
 * The assertions below instead key on the explicit "Cannot read:" marker, which
 * `executeLsp` returns *only* when `readFileContent` bailed out. That flips
 * exactly when the guard is removed.
 *
 * Note: absolute paths are excluded by construction — `join(root, absolute)`
 * produces a nonsense path on Windows, so it fails regardless of the guard and
 * cannot distinguish the two behaviours. The relative-escape case can.
 */
describe('LSPTool path containment', () => {
  let sandbox: string;
  let outsideDir: string;
  let probeName: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cy-lsp-in-'));
    outsideDir = mkdtempSync(join(tmpdir(), 'cy-lsp-out-'));
    writeFileSync(join(outsideDir, 'secret.ts'), 'export const LEAKED = 1;\n');
    // A probe one level above the working root, reachable as `../<name>`.
    probeName = `CY_LSP_PROBE_${Date.now()}.ts`;
    const parent = dirname(process.cwd());
    try {
      writeFileSync(join(parent, probeName), 'export const ESCAPED = 1;\n');
    } catch {
      // If the parent is not writable the escape test is skipped below.
    }
    process.env['CODEX_SANDBOX'] = sandbox;
  });

  afterEach(() => {
    delete process.env['CODEX_SANDBOX'];
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
    try {
      rmSync(join(dirname(process.cwd()), probeName), { force: true });
    } catch {
      /* best effort */
    }
  });

  it('refuses an absolute path outside the working root', async () => {
    const result = await executeLsp('diagnostics', join(outsideDir, 'secret.ts'));
    expect(result).toContain('Cannot read');
  });

  it('refuses a relative path that escapes the working root', async () => {
    const result = await executeLsp('diagnostics', `../${basename(probeName)}`);
    // The key assertion: with the guard, readFileContent returns null and
    // executeLsp reports "Cannot read". Without it, the file is read and the
    // result is "No issues found in ...".
    expect(result).toContain('Cannot read');
  });

  it('reads a file inside the working root', async () => {
    // Drop the sandbox: the repo file is not inside the temp dir, and `root` is
    // fixed to process.cwd().
    delete process.env['CODEX_SANDBOX'];
    const result = await executeLsp('diagnostics', 'src/version.ts');
    expect(result).not.toContain('Cannot read');
  });
});
