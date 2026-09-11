import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from './version.js';

const srcDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(srcDir, '..', 'package.json'), 'utf-8')) as { version: string };

/** Recursively collect .ts source files, skipping tests and benches. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.bench.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('version single-sourcing', () => {
  it('VERSION matches package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('VERSION is valid semver', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
  });

  it('no source file hardcodes the app version instead of importing VERSION', () => {
    // Regression guard: A2A / MCP client / web server / NetworkTool once each
    // hardcoded a stale app version (e.g. '0.7.0') instead of importing VERSION,
    // so they reported different versions than the CLI.
    //
    // Protocol/API versions are legitimately independent of the app version and
    // are named explicitly (e.g. BRIDGE_API_VERSION), so they're excluded.
    const offenders: string[] = [];
    // Negative lookbehind so BRIDGE_API_VERSION / SCHEMA_VERSION (a longer
    // identifier ending in VERSION) isn't mistaken for the app version.
    const versionLiteral = /(?<![A-Z_])(?:version|VERSION|USER_AGENT)\s*[:=][^\n]{0,40}['"](\d+\.\d+\.\d+)['"]/g;

    for (const file of sourceFiles(srcDir)) {
      if (file.endsWith('version.test.ts')) continue;
      const text = readFileSync(file, 'utf-8');
      for (const match of text.matchAll(versionLiteral)) {
        const [full, found] = match;
        if (found === pkg.version) continue;
        // Skip explicitly named protocol/API versions.
        if (/API_VERSION|PROTOCOL_VERSION|SCHEMA_VERSION/.test(full)) continue;
        offenders.push(`${file.replace(srcDir, 'src')}: ${full.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
