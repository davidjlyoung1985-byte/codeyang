import { readFile, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, isAbsolute, relative } from 'node:path';
import { execa } from 'execa';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);

/** Convert a glob-like include pattern to a proper regex. */
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

/** Fast: try ripgrep if available. Returns null if rg not found or fails. */
async function tryRipgrep(pattern: string, includeRegex: RegExp | null, base: string): Promise<string | null> {
  try {
    const args: string[] = ['-n', '-i', '--no-heading', '-m', '20'];
    if (includeRegex) {
      // Convert includeRegex to glob for rg
      const glob = includeRegex.source.replace(/\\./g, '.').replace(/\\.\*/g, '.*');
      args.push('-g', glob);
    }
    args.push(pattern, base);

    const result = await execa('rg', args, {
      timeout: 10_000,
      reject: false,
      env: { ...process.env },
    });

    if (result.exitCode === 0) {
      return result.stdout || '(no matches)';
    }
    if (result.exitCode === 1) {
      return '(no matches)';
    }
    return null; // rg failed, fall back
  } catch {
    return null; // rg not installed or errored
  }
}

/** Streaming line-by-line grep for a single file. Returns matched line numbers + text. */
async function grepFileLineStream(filePath: string, regex: RegExp, maxMatches: number): Promise<string[] | null> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  // Quick binary check on the string
  if (content.includes('\x00')) return null;

  const lines = content.split('\n');
  const matches: string[] = [];
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    if (regex.test(lines[i])) {
      matches.push(`${i + 1}: ${lines[i].trim()}`);
    }
  }
  return matches.length > 0 ? matches : null;
}

export async function executeGrep(pattern: string, include?: string, path?: string): Promise<string> {
  const base = path ? (isAbsolute(path) ? path : join(process.cwd(), path)) : process.cwd();
  const includeRegex = include ? globToRegex(include) : null;

  // Try ripgrep first — 10-50x faster
  const rgResult = await tryRipgrep(pattern, includeRegex, base);
  if (rgResult !== null) return rgResult;

  // Fallback: walk directory tree with streaming reads
  const regex = new RegExp(pattern, 'i');
  const results: { file: string; lines: string[] }[] = [];

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
        const matched = await grepFileLineStream(full, regex, 20);
        if (matched) {
          const relPath = relative(base, full).replace(/\\/g, '/');
          results.push({ file: relPath, lines: matched });
        }
      }
    }
  }

  await walk(base);
  if (results.length === 0) return '(no matches)';

  return results.map((r) => `${r.file}\n${r.lines.join('\n')}`).join('\n\n');
}
