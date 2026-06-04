import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Copy a file or directory recursively
 */
export async function executeCopy(sourcePath: string, destPath: string, overwrite = false): Promise<string> {
  try {
    const absSource = path.resolve(sourcePath);
    const absDest = path.resolve(destPath);

    if (!existsSync(absSource)) {
      return `Error: Source path does not exist: ${sourcePath}`;
    }

    if (absSource === absDest) {
      return `Error: Source and destination are the same: ${sourcePath}`;
    }

    // Check if source is ancestor of dest (would cause infinite recursion)
    if (absDest.startsWith(absSource + path.sep)) {
      return `Error: Cannot copy a directory into itself: ${sourcePath} -> ${destPath}`;
    }

    const sourceStats = await fs.stat(absSource);

    if (sourceStats.isDirectory()) {
      return await copyDirectory(absSource, absDest, overwrite);
    } else {
      return await copyFile(absSource, absDest, overwrite);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error copying ${sourcePath} to ${destPath}: ${msg}`;
  }
}

async function copyFile(source: string, dest: string, overwrite: boolean): Promise<string> {
  if (existsSync(dest) && !overwrite) {
    return `Error: Destination already exists (use overwrite=true): ${dest}`;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);

  return `Copied file: ${source} -> ${dest}`;
}

async function copyDirectory(source: string, dest: string, overwrite: boolean): Promise<string> {
  if (existsSync(dest) && !overwrite) {
    return `Error: Destination directory already exists (use overwrite=true): ${dest}`;
  }

  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(source, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, overwrite);
    } else {
      await copyFile(srcPath, destPath, overwrite);
    }
    count++;
  }

  return `Copied directory: ${source} -> ${dest} (${count} entries)`;
}

/**
 * Move or rename a file or directory
 */
export async function executeMove(sourcePath: string, destPath: string, overwrite = false): Promise<string> {
  try {
    const absSource = path.resolve(sourcePath);
    const absDest = path.resolve(destPath);

    if (!existsSync(absSource)) {
      return `Error: Source path does not exist: ${sourcePath}`;
    }

    if (absSource === absDest) {
      return `Error: Source and destination are the same: ${sourcePath}`;
    }

    if (existsSync(absDest) && !overwrite) {
      return `Error: Destination already exists (use overwrite=true): ${destPath}`;
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(absDest), { recursive: true });

    // Try atomic rename first (fast if same filesystem)
    try {
      await fs.rename(absSource, absDest);
      return `Moved: ${sourcePath} -> ${destPath}`;
    } catch (renameErr) {
      // If rename fails (e.g., cross-device), fall back to copy+delete
      const sourceStats = await fs.stat(absSource);
      if (sourceStats.isDirectory()) {
        await copyDirectory(absSource, absDest, overwrite);
      } else {
        await copyFile(absSource, absDest, overwrite);
      }
      await fs.rm(absSource, { recursive: true, force: true });
      return `Moved (copy+delete): ${sourcePath} -> ${destPath}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error moving ${sourcePath} to ${destPath}: ${msg}`;
  }
}

/**
 * Delete a file or directory
 */
export async function executeDelete(targetPath: string, recursive = false, force = false): Promise<string> {
  try {
    const absPath = path.resolve(targetPath);

    if (!existsSync(absPath)) {
      if (force) {
        return `Path does not exist (ignored with force=true): ${targetPath}`;
      }
      return `Error: Path does not exist: ${targetPath}`;
    }

    const stats = await fs.stat(absPath);

    if (stats.isDirectory()) {
      if (!recursive) {
        const entries = await fs.readdir(absPath);
        if (entries.length > 0) {
          return `Error: Directory is not empty (use recursive=true): ${targetPath}`;
        }
      }
      // On Windows, rm requires recursive: true even for empty directories
      await fs.rm(absPath, { recursive: true, force });
      return `Deleted directory: ${targetPath}${recursive ? ' (recursive)' : ''}`;
    } else {
      await fs.unlink(absPath);
      return `Deleted file: ${targetPath}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error deleting ${targetPath}: ${msg}`;
  }
}

/**
 * Create a directory (with parents if needed)
 */
export async function executeMkdir(dirPath: string, recursive = true): Promise<string> {
  try {
    const absPath = path.resolve(dirPath);

    if (existsSync(absPath)) {
      const stats = await fs.stat(absPath);
      if (stats.isDirectory()) {
        return `Directory already exists: ${dirPath}`;
      } else {
        return `Error: Path exists but is not a directory: ${dirPath}`;
      }
    }

    await fs.mkdir(absPath, { recursive });
    return `Created directory: ${dirPath}${recursive ? ' (with parents)' : ''}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error creating directory ${dirPath}: ${msg}`;
  }
}

/**
 * List directory with detailed information
 */
export async function executeList(
  dirPath: string,
  showHidden = false,
  details = false,
): Promise<string> {
  try {
    const absPath = path.resolve(dirPath);

    if (!existsSync(absPath)) {
      return `Error: Path does not exist: ${dirPath}`;
    }

    const stats = await fs.stat(absPath);
    if (!stats.isDirectory()) {
      return `Error: Path is not a directory: ${dirPath}`;
    }

    const entries = await fs.readdir(absPath, { withFileTypes: true });
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
        const itemStats = await fs.stat(fullPath);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error listing directory ${dirPath}: ${msg}`;
  }
}

/**
 * Check if a path exists
 */
export async function executeExists(targetPath: string): Promise<string> {
  try {
    const absPath = path.resolve(targetPath);

    if (!existsSync(absPath)) {
      return `Path does not exist: ${targetPath}`;
    }

    const stats = await fs.stat(absPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const size = stats.size;
    const modified = stats.mtime.toISOString();

    return `Path exists: ${targetPath}\nType: ${type}\nSize: ${size} bytes\nModified: ${modified}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error checking path ${targetPath}: ${msg}`;
  }
}
