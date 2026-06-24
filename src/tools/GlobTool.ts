import { readdir } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { type Dirent } from 'node:fs';
import { globToRegex } from '../utils/globMatch.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);
const MAX_GLOB_PATTERN_LENGTH = 500;

/** 验证 glob 模式长度，防止过度资源消耗 */
function validateGlobPattern(pattern: string): string | null {
  if (pattern.length > MAX_GLOB_PATTERN_LENGTH) {
    return `Glob pattern too long (${pattern.length} chars, max ${MAX_GLOB_PATTERN_LENGTH})`;
  }
  return null;
}

export function matchGlob(pattern: string, path: string): boolean {
  return globToRegex(pattern).test(path);
}

export async function executeGlob(pattern: string, root?: string): Promise<string> {
  try {
    const validationError = validateGlobPattern(pattern);
    if (validationError) {
      return `Error: ${validationError}`;
    }

    const base = root ? (isAbsolute(root) ? root : join(process.cwd(), root)) : process.cwd();
    const results: string[] = [];
    const regex = globToRegex(pattern);

    async function walk(dir: string): Promise<void> {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const full = join(dir, entry.name);
        const rel = relative(base, full).replace(/\\/g, '/');

        if (regex.test(rel)) {
          results.push(rel);
        }

        if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
          // Only recurse if the pattern could match deeper
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
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
