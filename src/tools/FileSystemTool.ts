import { readFile, writeFile, mkdir, readdir, stat, rm, access, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { resolveSafePath } from './shared.js';

/**
 * Copy a file or directory recursively
 */
export async function executeCopy(sourcePath: string, destPath: string, overwrite = false): Promise<string> {
  const absSource = resolveSafePath(sourcePath);
  const absDest = resolveSafePath(destPath);

  if (!existsSync(absSource)) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }

  if (absSource === absDest) {
    throw new Error(`Source and destination are the same: ${sourcePath}`);
  }

  // Check if source is ancestor of dest (would cause infinite recursion)
  if (absDest.startsWith(absSource + path.sep)) {
    throw new Error(`Cannot copy a directory into itself: ${sourcePath} -> ${destPath}`);
  }

  const sourceStats = await stat(absSource);

  if (sourceStats.isDirectory()) {
    return await copyDirectory(absSource, absDest, overwrite);
  } else {
    return await copyFile(absSource, absDest, overwrite);
  }
}

async function copyFile(source: string, dest: string, overwrite: boolean): Promise<string> {
  if (existsSync(dest) && !overwrite) {
    throw new Error(`Destination already exists (use overwrite=true): ${dest}`);
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await readFile(source));

  return `Copied file: ${source} -> ${dest}`;
}

async function copyDirectory(source: string, dest: string, overwrite: boolean): Promise<string> {
  if (existsSync(dest) && !overwrite) {
    throw new Error(`Destination directory already exists (use overwrite=true): ${dest}`);
  }

  await mkdir(dest, { recursive: true });

  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, overwrite);
    } else {
      await copyFile(srcPath, destPath, overwrite);
    }
  }

  return `Copied directory: ${source} -> ${dest} (${entries.length} entries)`;
}

/**
 * Move or rename a file or directory
 */
export async function executeMove(sourcePath: string, destPath: string, overwrite = false): Promise<string> {
  const absSource = resolveSafePath(sourcePath);
  const absDest = resolveSafePath(destPath);

  if (!existsSync(absSource)) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }

  if (absSource === absDest) {
    throw new Error(`Source and destination are the same: ${sourcePath}`);
  }

  if (existsSync(absDest) && !overwrite) {
    throw new Error(`Destination already exists (use overwrite=true): ${destPath}`);
  }

  // Ensure parent directory exists
  await mkdir(path.dirname(absDest), { recursive: true });

  // Try atomic rename first (fast if same filesystem)
  try {
    await rename(absSource, absDest);
    return `Moved: ${sourcePath} -> ${destPath}`;
  } catch {
    // Cross-device or other rename failure → fall back to copy + delete
    const sourceStats = await stat(absSource);
    if (sourceStats.isDirectory()) {
      await copyDirectory(absSource, absDest, overwrite);
    } else {
      await copyFile(absSource, absDest, overwrite);
    }
    await rm(absSource, { recursive: true, force: true });
    return `Moved (copy+delete): ${sourcePath} -> ${destPath}`;
  }
}

/**
 * Delete a file or directory
 * @param targetPath - Path to delete
 * @param recursive - Allow deleting non-empty directories
 * @param force - Ignore "path does not exist" errors (does NOT override read-only protection)
 */
export async function executeDelete(targetPath: string, recursive = false, force = false): Promise<string> {
  const absPath = resolveSafePath(targetPath);

  if (!existsSync(absPath)) {
    if (force) {
      return `Path does not exist (ignored with force=true): ${targetPath}`;
    }
    throw new Error(`Path does not exist: ${targetPath}`);
  }

  const stats = await stat(absPath);

  if (stats.isDirectory()) {
    if (!recursive) {
      const entries = await readdir(absPath);
      if (entries.length > 0) {
        throw new Error(`Directory is not empty (use recursive=true): ${targetPath}`);
      }
    }
    // On Windows, rm requires recursive: true even for empty directories
    // Note: force is NOT passed to rm() to prevent bypassing read-only protection
    await rm(absPath, { recursive: true });
    return `Deleted directory: ${targetPath}${recursive ? ' (recursive)' : ''}`;
  } else {
    await rm(absPath);
    return `Deleted file: ${targetPath}`;
  }
}

/**
 * Create a directory (with parents if needed)
 */
export async function executeMkdir(dirPath: string, recursive = true): Promise<string> {
  const absPath = resolveSafePath(dirPath);

  if (existsSync(absPath)) {
    const stats = await stat(absPath);
    if (stats.isDirectory()) {
      return `Directory already exists: ${dirPath}`;
    } else {
      throw new Error(`Path exists but is not a directory: ${dirPath}`);
    }
  }

  await mkdir(absPath, { recursive });
  return `Created directory: ${dirPath}${recursive ? ' (with parents)' : ''}`;
}

/**
 * List directory with detailed information
 */
export async function executeList(dirPath: string, showHidden = false, details = false): Promise<string> {
  const absPath = resolveSafePath(dirPath);

  if (!existsSync(absPath)) {
    throw new Error(`Path does not exist: ${dirPath}`);
  }

  const stats = await stat(absPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }

  const entries = await readdir(absPath, { withFileTypes: true });
  const filtered = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'));

  if (filtered.length === 0) {
    return `Directory is empty: ${dirPath}`;
  }

  if (!details) {
    const dirs = filtered.filter((e) => e.isDirectory()).map((e) => e.name + '/');
    const files = filtered.filter((e) => !e.isDirectory()).map((e) => e.name);
    return `${dirPath}:\n${[...dirs, ...files].join('\n')}`;
  }

  // Detailed listing
  const lines: string[] = [`Directory: ${dirPath}`, ''];
  const items = await Promise.all(
    filtered.map(async (entry) => {
      const fullPath = path.join(absPath, entry.name);
      const itemStats = await stat(fullPath);
      const size = itemStats.size;
      const modified = itemStats.mtime.toISOString().slice(0, 16).replace('T', ' ');
      const type = entry.isDirectory() ? 'DIR ' : 'FILE';
      const sizeStr = entry.isDirectory() ? '       -' : size.toString().padStart(8);
      return { name: entry.name, type, size: sizeStr, modified, isDir: entry.isDirectory() };
    }),
  );

  // Sort: directories first, then by name
  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const item of items) {
    lines.push(`${item.type}  ${item.size}  ${item.modified}  ${item.name}${item.isDir ? '/' : ''}`);
  }

  return lines.join('\n');
}

/**
 * Check if a path exists
 */
export async function executeExists(targetPath: string): Promise<string> {
  try {
    const absPath = resolveSafePath(targetPath);
    await access(absPath);

    const stats = await stat(absPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const size = stats.size;
    const modified = stats.mtime.toISOString();

    return `Path exists: ${targetPath}\nType: ${type}\nSize: ${size} bytes\nModified: ${modified}`;
  } catch {
    return `Path does not exist: ${targetPath}`;
  }
}
