import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

export const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '3rdparty', 'third_party']);
export const SOURCE_EXTS = new Set(['.cpp', '.h', '.hpp', '.cxx', '.cc']);
export const QML_EXTS = new Set(['.qml']);

export interface CollectFilesOptions {
  skipDirs?: Set<string>;
  skipPrefixes?: string[];
  extensions?: Set<string>;
  fileFilter?: (name: string) => boolean;
}

async function readDirEntries(d: string) {
  try {
    return await readdir(d, { withFileTypes: true });
  } catch {
    return null;
  }
}

export async function collectFiles(dir: string, opts: CollectFilesOptions = {}): Promise<string[]> {
  const { skipDirs = SKIP_DIRS, skipPrefixes = [], extensions, fileFilter } = opts;

  const results: string[] = [];

  async function walk(d: string) {
    const entries = await readDirEntries(d);
    if (!entries) return;

    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skipDirs.has(entry.name)) {
          await walk(full);
        }
      } else if (entry.isFile()) {
        if (skipPrefixes.some((p) => entry.name.startsWith(p))) continue;
        if (extensions && !extensions.has(extname(entry.name).toLowerCase())) continue;
        if (fileFilter && !fileFilter(entry.name)) continue;
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}
