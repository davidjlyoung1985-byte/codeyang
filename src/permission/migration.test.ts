import { describe, it, expect } from 'vitest';
import { migrateConfig } from './index.js';
import type { PermissionRule } from './index.js';

/** Build a v2 config the way older builds wrote it. */
function v2Config(rules: Partial<PermissionRule>[]): { version: number; rules: PermissionRule[] } {
  return { version: 2, rules: rules as PermissionRule[] };
}

const V2_DEFAULTS: PermissionRule[] = [
  { pattern: 'rm -rf*', level: 'ask', category: 'bash' },
  { pattern: 'sudo*', level: 'ask', category: 'bash' },
  { pattern: 'git push --force*', level: 'ask', category: 'bash' },
  { pattern: 'curl*|*sh', level: 'deny', category: 'bash' },
  { pattern: '> /dev/sd*', level: 'deny', category: 'bash' },
  { pattern: 'mkfs*', level: 'deny', category: 'bash' },
  { pattern: '**', level: 'allow', category: 'file' },
  { pattern: '**', level: 'allow', category: 'network' },
];

describe('permission config migration', () => {
  it('upgrades a v2 config to the current version', () => {
    const result = migrateConfig(v2Config(V2_DEFAULTS));
    expect(result).not.toBeNull();
    expect(result!.version).toBeGreaterThan(2);
  });

  it('returns null for an already-current config', () => {
    const current = { version: 99, rules: [] as PermissionRule[] };
    expect(migrateConfig(current)).toBeNull();
  });

  // ── Preserving user intent ──
  it('keeps user-authored rules', () => {
    const result = migrateConfig(
      v2Config([...V2_DEFAULTS, { pattern: 'my-secret-tool*', level: 'deny', category: 'bash' }]),
    );
    expect(result!.rules.some((r) => r.pattern === 'my-secret-tool*' && r.level === 'deny')).toBe(true);
  });

  it('never loosens a deny rule the user set', () => {
    // User tightened `rm -rf*` to deny. Migration must not drop it, even though
    // the current default for that pattern set no longer contains it.
    const result = migrateConfig(v2Config([{ pattern: 'rm -rf*', level: 'deny', category: 'bash' }]));
    expect(result!.rules.some((r) => r.pattern === 'rm -rf*' && r.level === 'deny')).toBe(true);
  });

  it('preserves order of user rules', () => {
    const result = migrateConfig(
      v2Config([
        { pattern: 'aaa', level: 'deny', category: 'bash' },
        { pattern: 'bbb', level: 'deny', category: 'bash' },
        { pattern: 'ccc', level: 'deny', category: 'bash' },
      ]),
    );
    const userPatterns = result!.rules.filter((r) => ['aaa', 'bbb', 'ccc'].includes(r.pattern)).map((r) => r.pattern);
    expect(userPatterns).toEqual(['aaa', 'bbb', 'ccc']);
  });

  // ── Dropping stale built-ins ──
  it('drops stale built-in rules that the current table replaces', () => {
    const result = migrateConfig(v2Config(V2_DEFAULTS));
    // v2 shipped `rm -rf*`; v3 decides recursive deletes by target path instead.
    const rmRules = result!.rules.filter((r) => r.pattern.startsWith('rm -rf'));
    expect(rmRules).toHaveLength(0);
  });

  // Shipped defaults have not been spelled consistently across versions: some
  // builds wrote `rm -rf*`, others `rm -rf *` with a space. Both must go, or the
  // survivor keeps shadowing the path-based check and `rm -rf dist` stays
  // blocked while `rm -rf /` is caught by the wrong mechanism.
  it.each(['rm -rf*', 'rm -rf *', 'rm -fr*', 'rm -fr *', 'sudo *', 'curl *| sh', '> /dev/sd*'])(
    'drops the stale built-in spelling %s',
    (pattern) => {
      const result = migrateConfig(v2Config([{ pattern, level: 'ask', category: 'bash' }]));
      expect(result!.rules.some((r) => r.pattern === pattern)).toBe(false);
    },
  );

  it('keeps a stale pattern that the user tightened to deny', () => {
    // `curl *| sh` was a built-in deny. There is no way to tell it apart from a
    // user who typed it themselves, so it is preserved — dropping it could
    // unlock something the user locked down.
    const result = migrateConfig(v2Config([{ pattern: 'curl *| sh', level: 'deny', category: 'bash' }]));
    expect(result!.rules.some((r) => r.pattern === 'curl *| sh')).toBe(true);
    // The current, broader rule is added as well.
    expect(result!.rules.some((r) => r.pattern === 'curl*|*sh' && r.level === 'deny')).toBe(true);
  });

  it('removes the old single-* catch-alls that never matched paths', () => {
    const result = migrateConfig(
      v2Config([
        { pattern: '*', level: 'allow', category: 'file' },
        { pattern: '*', level: 'allow', category: 'network' },
      ]),
    );
    const singleStar = result!.rules.filter((r) => r.pattern === '*');
    expect(singleStar).toHaveLength(0);
  });

  it('does not duplicate rules already present in the current defaults', () => {
    const result = migrateConfig(v2Config(V2_DEFAULTS));
    const keys = result!.rules.map((r) => `${r.category}|${r.pattern}|${r.level}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  // ── The pathological case this migration exists for ──
  it('collapses a config polluted with thousands of duplicates', () => {
    // Mirrors a real ~/.codeyang/permissions.json: 1800+ repeated test rules
    // accumulated from test runs that failed to isolate CODEYANG_HOME.
    const polluted: PermissionRule[] = [...V2_DEFAULTS];
    for (let i = 0; i < 600; i++) {
      polluted.push({ pattern: 'test-*', level: 'deny', category: 'bash' });
      polluted.push({ pattern: 'danger-command', level: 'deny', category: 'bash' });
      polluted.push({ pattern: 'danger', level: 'allow', category: 'bash' });
    }

    const result = migrateConfig(v2Config(polluted));
    expect(polluted.length).toBeGreaterThan(1800);
    expect(result!.rules.length).toBeLessThan(60);
  });

  it('drops malformed entries instead of crashing', () => {
    const result = migrateConfig({
      version: 2,
      rules: [null, { pattern: 123 }, { pattern: 'ok', level: 'deny', category: 'bash' }] as unknown as PermissionRule[],
    });
    expect(result!.rules.some((r) => r.pattern === 'ok')).toBe(true);
  });
});
