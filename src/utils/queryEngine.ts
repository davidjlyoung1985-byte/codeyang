/**
 * QueryEngine — file index and search engine powered by ripgrep with caching.
 *
 * Features:
 * - Fast file listing with cached directory tree
 * - Symbol extraction (function/class/interface definitions via regex)
 * - Content search with caching
 * - Cross-file reference search
 */
import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execa } from 'execa';

interface SymbolEntry {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable';
  file: string;
  line: number;
}

const CACHE_DIR = join(homedir(), '.codeyang', 'cache');

async function ensureCache() {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cacheKey(root: string, suffix: string): string {
  const safe = root.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(CACHE_DIR, `${safe}_${suffix}.json`);
}

function isCacheValid(cachePath: string): boolean {
  try {
    const cacheStat = statSync(cachePath);
    // Cache valid for 60 seconds after last access
    return Date.now() - cacheStat.mtimeMs < 60_000;
  } catch {
    return false;
  }
}

/**
 * List all files in a project, with caching.
 */
export async function listFiles(root: string, pattern?: string): Promise<string[]> {
  await ensureCache();
  const cachePath = cacheKey(root, 'files');

  if (isCacheValid(cachePath)) {
    const cached = JSON.parse(await readFile(cachePath, 'utf-8')) as string[];
    if (pattern) return cached.filter((f) => f.includes(pattern));
    return cached;
  }

  // Use ripgrep for fast file listing
  try {
    const result = await execa('rg', ['--files', '--no-ignore', root], {
      timeout: 30_000,
      reject: false,
    });
    const files = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((f) => f.trim());
    await writeFile(cachePath, JSON.stringify(files));
    if (pattern) return files.filter((f) => f.includes(pattern));
    return files;
  } catch {
    // Fallback to Node.js walk
    const files = await walkDir(root);
    await writeFile(cachePath, JSON.stringify(files));
    if (pattern) return files.filter((f) => f.includes(pattern));
    return files;
  }
}

async function walkDir(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', '__pycache__', '.venv']);

  async function walk(current: string) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        results.push(relative(dir, full));
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Search file contents with ripgrep. Returns matches with line numbers.
 */
export async function searchContent(
  root: string,
  query: string,
  filePattern?: string,
): Promise<Array<{ file: string; line: number; content: string }>> {
  const args = ['--line-number', '--no-heading', '--color', 'never', query];
  if (filePattern) args.push('--glob', filePattern);
  args.push(root);

  try {
    const result = await execa('rg', args, { timeout: 15_000, reject: false });
    const lines = result.stdout.split('\n').filter(Boolean);
    return lines.map((line) => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match) {
        return { file: match[1], line: Number(match[2]), content: match[3].trim() };
      }
      return { file: line, line: 0, content: '' };
    });
  } catch {
    return [];
  }
}

/**
 * Extract symbols (functions, classes, interfaces) from a file using regex.
 */
export async function extractSymbols(root: string, filePath: string): Promise<SymbolEntry[]> {
  const absPath = resolve(root, filePath);
  if (!existsSync(absPath)) return [];

  const content = await readFile(absPath, 'utf-8');
  const lines = content.split('\n');
  const symbols: SymbolEntry[] = [];

  // Function declarations
  const funcRe = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  // Class declarations
  const classRe = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
  // Interface declarations
  const ifaceRe = /(?:export\s+)?interface\s+(\w+)/g;
  // Type declarations
  const typeRe = /(?:export\s+)?type\s+(\w+)\s*=/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and strings
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    let match: RegExpExecArray | null;

    funcRe.lastIndex = 0;
    if ((match = funcRe.exec(line))) {
      symbols.push({ name: match[1], kind: 'function', file: filePath, line: i + 1 });
      continue;
    }

    classRe.lastIndex = 0;
    if ((match = classRe.exec(line))) {
      symbols.push({ name: match[1], kind: 'class', file: filePath, line: i + 1 });
      continue;
    }

    ifaceRe.lastIndex = 0;
    if ((match = ifaceRe.exec(line))) {
      symbols.push({ name: match[1], kind: 'interface', file: filePath, line: i + 1 });
      continue;
    }

    typeRe.lastIndex = 0;
    if ((match = typeRe.exec(line))) {
      symbols.push({ name: match[1], kind: 'type', file: filePath, line: i + 1 });
      continue;
    }
  }

  return symbols;
}
