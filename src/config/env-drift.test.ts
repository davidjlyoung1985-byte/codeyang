import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ENV_SPECS, envNames, getEnvSpec, envByCategory } from './env.js';

/**
 * Drift guard.
 *
 * `src/config/index.ts` used to claim it was "unified configuration replacing
 * scattered process.env access". In reality it declared 25 names, 5 of which
 * were wrong (CODEYANG_WATCH_MODE vs the CODEYANG_WATCH the agent actually
 * reads), and it covered 15 of the 61 variables read across 27 files. The
 * `--help` output listed 8. Nothing could enumerate the real surface, so no
 * one noticed.
 *
 * These tests fail the build if that happens again.
 */

const SRC = join(__dirname, '..');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !/\.(test|bench)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** name -> files that read it */
function scanEnvUsage(): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  for (const file of collectSourceFiles(SRC)) {
    const rel = relative(SRC, file).replace(/\\/g, '/');
    // env.ts is the registry itself; envReader.ts is the typed accessor layer.
    if (rel === 'config/env.ts' || rel === 'config/envReader.ts') continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/process\.env(?:\[['"]|\.)([A-Z0-9_]+)/g)) {
      const list = usage.get(m[1]) ?? [];
      if (!list.includes(rel)) list.push(rel);
      usage.set(m[1], list);
    }
  }
  return usage;
}

const USAGE = scanEnvUsage();
const DECLARED = new Set(envNames());

describe('env registry / drift guard', () => {
  it('declares every variable that is actually read', () => {
    const undeclared = [...USAGE.keys()].filter((n) => !DECLARED.has(n)).sort();
    expect(
      undeclared,
      `These variables are read in src/ but missing from src/config/env.ts:\n` +
        undeclared.map((n) => `  ${n}  <- ${USAGE.get(n)!.join(', ')}`).join('\n'),
    ).toEqual([]);
  });

  it('has no declared variable that nothing reads', () => {
    // PATH and HOME are read by tools via process.env, so they appear in USAGE.
    const unread = [...DECLARED].filter((n) => !USAGE.has(n)).sort();
    expect(
      unread,
      `These variables are declared in src/config/env.ts but never read:\n  ` + unread.join('\n  '),
    ).toEqual([]);
  });

  it('has no duplicate declarations', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const s of ENV_SPECS) {
      if (seen.has(s.name)) dupes.push(s.name);
      seen.add(s.name);
    }
    expect(dupes).toEqual([]);
  });

  it('gives every variable a non-empty description', () => {
    const missing = ENV_SPECS.filter((s) => !s.description || s.description.trim().length < 5).map((s) => s.name);
    expect(missing).toEqual([]);
  });

  it('marks credentials as secret', () => {
    const shouldBeSecret = [
      'CODEYANG_API_KEY',
      'DEEPSEEK_API_KEY',
      'GITHUB_TOKEN',
      'BRIDGE_TOKEN',
      'CODEYANG_WEB_API_KEY',
      'CODEYANG_SEARCH_KEY',
    ];
    for (const name of shouldBeSecret) {
      const spec = getEnvSpec(name);
      expect(spec, `${name} should be declared`).toBeDefined();
      expect(spec!.secret, `${name} should be flagged secret`).toBe(true);
    }
  });

  it('declares choices for enum-like variables', () => {
    for (const name of ['CODEYANG_PERMIT_RM', 'CODEYANG_PERMIT_SUDO', 'CODEYANG_PERMIT_FORCE']) {
      const spec = getEnvSpec(name)!;
      expect(spec.choices, `${name} should constrain its values`).toEqual(['allow', 'ask', 'deny']);
    }
    expect(getEnvSpec('CODEYANG_PROVIDER')!.choices).toEqual(['anthropic', 'deepseek', 'openai']);
  });
});

describe('env registry / lookups', () => {
  it('resolves a known variable', () => {
    expect(getEnvSpec('CODEYANG_MODEL')?.kind).toBe('string');
  });

  it('returns undefined for an unknown variable', () => {
    expect(getEnvSpec('NOT_A_REAL_VAR')).toBeUndefined();
  });

  it('groups every variable under exactly one category', () => {
    const grouped = envByCategory();
    const total = [...grouped.values()].reduce((a, list) => a + list.length, 0);
    expect(total).toBe(ENV_SPECS.length);
  });

  it('exposes at least the documented categories', () => {
    const groups = envByCategory();
    for (const cat of ['api', 'model', 'agent', 'permission', 'sandbox', 'tools', 'bridge', 'web']) {
      expect(groups.has(cat as never), `missing category ${cat}`).toBe(true);
    }
  });
});
