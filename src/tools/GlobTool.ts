import { readdir } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { type Dirent } from 'node:fs';

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
          if (i < pattern.length && pattern[i] === '/') {
            i++; // skip trailing /
          }
          regexStr += '.*';
        } else {
          // * matches anything except /
          i++;
          regexStr += '[^/]*';
        }
        break;

      case '?':
        // ? matches any single character except /
        i++;
        regexStr += '[^/]';
        break;

      case '[': {
        // Character class [...]
        const end = pattern.indexOf(']', i);
        if (end === -1) {
          // No closing bracket, treat as literal
          regexStr += '\\[';
          i++;
        } else {
          // Extract the character class content
          const classContent = pattern.slice(i + 1, end);
          if (classContent.startsWith('!')) {
            // [!...] is negated character class
            regexStr += '[^' + classContent.slice(1) + ']';
          } else {
            regexStr += '[' + classContent + ']';
          }
          i = end + 1;
        }
        break;
      }

      // Escaped regex metacharacters
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
