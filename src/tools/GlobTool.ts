import { readdir } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { type Dirent } from 'node:fs';
import { globToRegex } from '../utils/globMatch.js';
import { resolveSafePath } from './shared.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);
const MAX_GLOB_PATTERN_LENGTH = 500;

/** 目录递归最大深度，防止符号链接环导致无限递归。 */
const MAX_DEPTH = 25;

/** 结果条数上限。`**` 在大型仓库里可以匹配数十万条。 */
const MAX_RESULTS = 2000;

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
  const validationError = validateGlobPattern(pattern);
  if (validationError) {
    return `Error: ${validationError}`;
  }

  // SECURITY: same sandbox check as Read/Write. Without it a sandboxed session
  // could enumerate ~/.ssh or the whole filesystem.
  //
  // NOTE: this runs BEFORE the try/catch below on purpose. Security refusals
  // must propagate as exceptions, matching ReadTool/WriteTool. Folding them
  // into the `Error: ...` return value would let the model treat a blocked
  // path as an ordinary empty result and retry elsewhere.
  const base = root ? resolveSafePath(isAbsolute(root) ? root : join(process.cwd(), root)) : process.cwd();

  try {
    const results: string[] = [];
    const regex = globToRegex(pattern);
    let truncated = false;

    async function walk(dir: string, depth: number): Promise<void> {
      if (depth > MAX_DEPTH) {
        truncated = true;
        return;
      }

      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) {
          truncated = true;
          return;
        }

        const full = join(dir, entry.name);
        const rel = relative(base, full).replace(/\\/g, '/');

        if (regex.test(rel)) {
          results.push(rel);
        }

        if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
          // Only recurse if the pattern could match deeper
          if (pattern.includes('**')) {
            await walk(full, depth + 1);
          } else if (pattern.includes('/')) {
            const depthOfPath = rel.split('/').length;
            const patternDepth = pattern.split('/').length;
            if (depthOfPath < patternDepth) {
              await walk(full, depth + 1);
            }
          }
        }
      }
    }

    await walk(base, 0);
    if (results.length === 0) return '(no matches)';
    const body = results.join('\n');
    return truncated ? `${body}\n\n[Results truncated at ${MAX_RESULTS} entries / ${MAX_DEPTH} levels.]` : body;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
