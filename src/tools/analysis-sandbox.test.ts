import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeParseAst, executeComplexity, executeAnalyzeCode } from './CodeAnalysisTool.js';
import { executeSearch } from './SearchTool.js';

/**
 * Sandbox conformance for the analysis / search tools.
 *
 * A repo-wide sweep for "takes a path, never calls resolveSafePath" surfaced
 * these. `CodeAnalysisTool` used a bare `path.resolve(filePath)` in six places
 * and `SearchTool` passed `rootDir` straight to the project index.
 *
 * The secondary issue is how the refusal surfaced. The analysis helpers wrap
 * everything in `catch` -> `return \`Error parsing AST: ...\``, so a blocked
 * path arrived as an ordinary tool error the model could retry elsewhere. A
 * security refusal must throw.
 */
describe('analysis and search tools respect CODEX_SANDBOX', () => {
  let sandbox: string;
  let outside: string;
  let outsideFile: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cy-an-sbx-'));
    outside = mkdtempSync(join(tmpdir(), 'cy-an-out-'));
    outsideFile = join(outside, 'secret.ts');
    writeFileSync(outsideFile, 'export const LEAKED = 42;\n');
    process.env['CODEX_SANDBOX'] = sandbox;
    writeFileSync(join(sandbox, 'inside.ts'), 'export const OK = 1;\n');
  });

  afterEach(() => {
    delete process.env['CODEX_SANDBOX'];
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  describe('CodeAnalysisTool rejects outside paths', () => {
    it.each([
      ['executeParseAst', () => executeParseAst(outsideFile)],
      ['executeComplexity', () => executeComplexity(outsideFile)],
      ['executeAnalyzeCode', () => executeAnalyzeCode(outsideFile)],
    ])('%s throws instead of returning an error string', async (_name, run) => {
      await expect(run()).rejects.toThrow(/Path traversal blocked/i);
    });

    it('does not leak structural information about the outside file', async () => {
      // Before the fix this returned `Lines: 2` / `bodyLength: 1` etc.
      try {
        const out = await executeComplexity(outsideFile);
        expect(out).not.toContain('Lines:');
      } catch {
        // Throwing is the expected outcome.
      }
    });
  });

  describe('CodeAnalysisTool still works inside the sandbox', () => {
    it('analyses an in-sandbox file', async () => {
      const result = await executeComplexity(join(sandbox, 'inside.ts'));
      expect(result).toContain('Lines:');
    });
  });

  describe('SearchTool rejects an outside root', () => {
    it('throws rather than returning "no results"', async () => {
      await expect(executeSearch('LEAKED', outside)).rejects.toThrow(/Path traversal blocked/i);
    });

    it('still searches inside the sandbox', async () => {
      const result = await executeSearch('OK', sandbox);
      expect(typeof result).toBe('string');
    });
  });
});
