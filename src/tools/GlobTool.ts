import { readdir } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { statSync } from 'node:fs';

export function matchGlob(pattern: string, path: string): boolean {
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___GLOBSTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOBSTAR___/g, '.*');
  return new RegExp(`^${regex}$`).test(path);
}

export async function executeGlob(pattern: string, root?: string): Promise<string> {
  const base = root ? (isAbsolute(root) ? root : join(process.cwd(), root)) : process.cwd();
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(base, full).replace(/\\/g, '/');

      if (matchGlob(pattern, rel)) {
        results.push(rel);
      }

      if (entry.isDirectory()) {
        if (pattern.includes('**')) {
          await walk(full);
        } else if (pattern.includes('/')) {
          const depth = rel.split('/').length;
          const patternDepth = pattern.split('/').length;
          if (depth < patternDepth) {
            await walk(full);
          }
        }
      }
    }
  }

  await walk(base);
  return results.length > 0 ? results.join('\n') : '(no matches)';
}
