import { readdir } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { type Dirent } from 'node:fs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);

/**
 * Convert a glob pattern to a regex.
 * Supports: **, *, ?, [...], [!...]
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    switch (ch) {
      case '*':
        if (pattern[i + 1] === '*') {
          // ** matches zero or more directories
          i += 2;
          // Consume optional trailing /
          if (i < pattern.length && pattern[i] === '/') {
            i++;
          }
          // If ** is followed by more pattern, it matches anything across dirs.
          // If ** is the last token, it also matches everything (the trailing / was stripped).
          regexStr += i < pattern.length ? '(.*/)?' : '.*';
        } else {
          // * matches anything except /
          i++;
          regexStr += '[^/]*';
        }
        break;

      case '?':
        i++;
        regexStr += '[^/]';
        break;

      case '[': {
        const end = pattern.indexOf(']', i);
        if (end === -1) {
          regexStr += '\\[';
          i++;
        } else {
          let classContent = pattern.slice(i + 1, end);

          // Handle negation: [!...] or [^...]
          let negate = false;
          if (classContent.startsWith('!') || classContent.startsWith('^')) {
            negate = true;
            classContent = classContent.slice(1);
          }

          // If class is empty after negation (e.g., [!] or [^]), treat as literal brackets
          if (!classContent) {
            regexStr += '\\[' + pattern.slice(i + 1, end) + '\\]';
            i = end + 1;
            break;
          }

          // Escape regex metacharacters inside the class except for internal [
          // Note: ] as first char in class must be literal: []] matches ]
          const escaped = classContent.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\^/g, '\\^');
          regexStr += negate ? `[^${escaped}]` : `[${escaped}]`;
          i = end + 1;
        }
        break;
      }

      // Escape regex metacharacters
      case '.':
      case '^':
      case '$':
      case '+':
      case '{':
      case '}':
      case '(':
      case ')':
      case '|':
      case '\\':
        regexStr += '\\' + ch;
        i++;
        break;

      default:
        regexStr += ch;
        i++;
    }
  }

  // Strip trailing / (folder patterns like "src/" should match files inside)
  if (regexStr.endsWith('/')) {
    regexStr = regexStr.slice(0, -1) + '(/.*)?';
  }

  return new RegExp(`^${regexStr}$`);
}

export function matchGlob(pattern: string, path: string): boolean {
  return globToRegex(pattern).test(path);
}

export async function executeGlob(pattern: string, root?: string): Promise<string> {
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
}
