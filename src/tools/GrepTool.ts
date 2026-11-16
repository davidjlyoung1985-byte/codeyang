import { readFile, readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, isAbsolute, relative } from 'node:path';
import { globToRegex } from '../utils/globMatch.js';
import { resolveSafePath } from './shared.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);

/** 最大正则模式长度，防止 ReDoS 攻击 */
const MAX_REGEX_LENGTH = 500;

/** 单个文件的最大读取字节数。超过则跳过，避免把 5 GB 日志读进内存。 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** 目录递归最大深度，防止符号链接环导致无限递归。 */
const MAX_DEPTH = 25;

/** 跨文件的总匹配行数上限，防止在大仓库里把上下文打爆。 */
const MAX_TOTAL_LINES = 2000;

/** 验证正则模式是否安全（防止 ReDoS） */
function validateRegexPattern(pattern: string): string | null {
  if (pattern.length > MAX_REGEX_LENGTH) {
    return `Pattern too long (${pattern.length} chars, max ${MAX_REGEX_LENGTH})`;
  }
  // 检测嵌套量词（如 (a+)+、(a*)*、(a+)* 等），这些是 ReDoS 常见模式
  const nestedQuantifiers = /\([^()]*[+*][^()]*\)[+*]/g;
  if (nestedQuantifiers.test(pattern)) {
    return `Pattern contains potentially unsafe nested quantifiers`;
  }
  return null;
}

/** Fast: try ripgrep if available. Returns null if rg not found or fails. */
async function tryRipgrep(
  pattern: string,
  include: string | null,
  base: string,
  contextLines: number,
): Promise<string | null> {
  try {
    const { execa } = await import('execa');
    const args: string[] = ['-n', '-i', '--no-heading', '-m', '20'];
    if (contextLines > 0) args.push(`-C${contextLines}`);
    if (include) args.push('-g', include);
    // `--` terminates option parsing so a pattern beginning with `-`
    // (`--glob=...`, `-f/etc/passwd`) cannot be interpreted as an rg flag.
    args.push('--', pattern, base);

    const result = await execa('rg', args, {
      timeout: 10_000,
      reject: false,
      // Do not hand ripgrep the whole environment: it may be picked up by
      // config files or `rg`'s own env handling, and there is nothing it needs.
      env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
    });

    if (result.exitCode === 0) {
      return result.stdout || '(no matches)';
    }
    if (result.exitCode === 1) {
      // rg exit code 1 = no matches. But if stderr is not empty,
      // rg wasn't found or had an error — fall back to Node.js grep.
      if (result.stderr && result.stderr.length > 0) return null;
      return '(no matches)';
    }
    return null; // rg failed, fall back
  } catch {
    return null; // rg not installed or errored
  }
}

/**
 * Read a file line-by-line and collect matches with optional context.
 *
 * Despite the old name this is not a stream: `readFile` loads the whole file
 * first. Callers must therefore check the size up front — see MAX_FILE_BYTES.
 */
async function grepFileLineStream(
  filePath: string,
  regex: RegExp,
  maxMatches: number,
  contextLines = 0,
): Promise<string[] | null> {
  let content: string;
  try {
    // Skip oversized files instead of reading gigabytes into memory. A grep
    // that silently omits huge files is better than an OOM.
    const info = await stat(filePath);
    if (info.size > MAX_FILE_BYTES) return null;
    content = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  // Quick binary check on the string
  if (content.includes('\x00')) return null;

  const lines = content.split('\n');
  const matches: string[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    if (regex.test(lines[i])) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      for (let j = start; j <= end; j++) {
        if (!seen.has(j)) {
          seen.add(j);
          const prefix = j === i ? `${j + 1}: ` : `${j + 1}  `;
          matches.push(prefix + lines[j].trim());
        }
      }
      if (contextLines > 0) matches.push('--');
    }
  }
  return matches.length > 0 ? matches : null;
}

export async function executeGrep(pattern: string, include?: string, path?: string, contextLines = 0): Promise<string> {
  // SECURITY: the base path must go through the same sandbox check as Read and
  // Write. Without this, a sandboxed session could grep ~/.ssh or /etc —
  // `executeWrite` refuses those paths while `executeGrep` happily read them.
  const base = path ? resolveSafePath(isAbsolute(path) ? path : join(process.cwd(), path)) : process.cwd();
  const includeRegex = include ? globToRegex(include) : null;

  // Validate pattern to prevent ReDoS
  const validationError = validateRegexPattern(pattern);
  if (validationError) {
    return `Error: Invalid pattern — ${validationError}`;
  }

  // Try ripgrep first — 10-50x faster
  const rgResult = await tryRipgrep(pattern, include ?? null, base, contextLines);
  if (rgResult !== null) return rgResult;

  // Fallback: walk directory tree with streaming reads
  const regex = new RegExp(pattern, 'i');
  const results: { file: string; lines: string[] }[] = [];
  let totalLines = 0;
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
      if (totalLines >= MAX_TOTAL_LINES) {
        truncated = true;
        return;
      }

      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
          await walk(full, depth + 1);
        }
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(entry.name)) continue;
        const matched = await grepFileLineStream(full, regex, 20, contextLines);
        if (matched) {
          const relPath = relative(base, full).replace(/\\/g, '/');
          results.push({ file: relPath, lines: matched });
          totalLines += matched.length;
        }
      }
    }
  }

  await walk(base, 0);
  if (results.length === 0) return '(no matches)';

  const body = results.map((r) => `${r.file}\n${r.lines.join('\n')}`).join('\n\n');
  return truncated
    ? `${body}\n\n[Results truncated: hit the ${MAX_TOTAL_LINES}-line / ${MAX_DEPTH}-level scan limit. Narrow the path or include filter.]`
    : body;
}
