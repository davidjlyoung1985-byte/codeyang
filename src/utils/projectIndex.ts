import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

interface ProjectIndex {
  files: string[];
  lastBuilt: number;
}

let index: ProjectIndex | null = null;
const REBUILD_INTERVAL_MS = 60_000;

const EXCLUDE = new Set([
  'node_modules',
  '.git',
  'dist',
  '.cache',
  'build',
  'target',
  '__pycache__',
  '.venv',
  '.next',
  '.turbo',
  'coverage',
]);

async function walkDir(dir: string, base: string): Promise<string[]> {
  const entries: string[] = [];
  try {
    const dirEntries = await readdir(dir, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (EXCLUDE.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        entries.push(...(await walkDir(full, base)));
      } else {
        entries.push(relative(base, full));
      }
    }
  } catch {
    // Permission errors, non-existent paths etc. — skip silently
  }
  return entries;
}

/**
 * Returns a cached index of every file under `root` (default: cwd).
 * The index is lazily built on first call and rebuilt at most once per
 * `REBUILD_INTERVAL_MS` (60 s).  Call `invalidateIndex()` to force a rebuild.
 */
export async function getProjectIndex(root?: string): Promise<ProjectIndex> {
  const projectRoot = root || process.cwd();
  if (index && Date.now() - index.lastBuilt < REBUILD_INTERVAL_MS) {
    return index;
  }
  const files = await walkDir(projectRoot, projectRoot);
  index = { files, lastBuilt: Date.now() };
  return index;
}

/** Clear the cached index so the next call to getProjectIndex rebuilds it. */
export function invalidateIndex(): void {
  index = null;
}
