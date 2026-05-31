import { readFile, readdir } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { type Dirent } from 'node:fs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);

/**
 * Convert a glob-like include pattern to a proper regex.
 * Escapes regex metacharacters except for glob wildcards.
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    switch (ch) {
      case '*':
        regexStr += '.*';
        break;
      case '?':
        regexStr += '.';
        break;
      case '.':
      case '^':
      case '$':
      case '+':
      case '{':
      case '}':
      case '(':
      case ')':
      case '[':
      case ']':
      case '|':
      case '\\':
        regexStr += '\\' + ch;
        break;
      default:
        regexStr += ch;
    }
  }
  return new RegExp(regexStr);
}

export async function executeGrep(pattern: string, include?: string, path?: string): Promise<string> {
  const base = path ? (isAbsolute(path) ? path : join(process.cwd(), path)) : process.cwd();
  const results: { file: string; lines: string[] }[] = [];

  const regex = new RegExp(pattern, 'i');
  const includeRegex = include ? globToRegex(include) : null;

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
          await walk(full);
        }
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(entry.name)) continue;
        try {
          const content = await readFile(full, 'utf-8');
          const lines = content.split('\n');
          const matches: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push(`${i + 1}: ${lines[i].trim()}`);
            }
          }
          if (matches.length > 0) {
            // Use path.relative for correct cross-platform relative paths
            const relPath = relative(base, full).replace(/\\/g, '/');
            results.push({ file: relPath, lines: matches.slice(0, 20) });
          }
        } catch {}
      }
    }
  }

  await walk(base);
  if (results.length === 0) return '(no matches)';

  return results.map(r => {
    return `${r.file}\n${r.lines.join('\n')}`;
  }).join('\n\n');
}
