/**
 * Safe file system utilities.
 */

import { rename, stat, copyFile, unlink } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';

/**
 * Safely rename file with conflict resolution.
 *
 * If target exists, append a numeric suffix (e.g., file.txt → file-1.txt).
 *
 * @param oldPath - Current file path
 * @param newPath - Desired new path
 * @returns Final path after rename
 */
export async function safeRenameWithSuffix(oldPath: string, newPath: string): Promise<string> {
  let finalPath = newPath;
  let counter = 1;

  // Check if target exists
  while (await fileExists(finalPath)) {
    const dir = dirname(newPath);
    const ext = basename(newPath).includes('.') ? `.${basename(newPath).split('.').pop()}` : '';
    const base = basename(newPath, ext);
    finalPath = join(dir, `${base}-${counter}${ext}`);
    counter++;
  }

  await atomicRename(oldPath, finalPath);
  return finalPath;
}

/**
 * Atomic rename that handles cross-device moves and Windows file locking.
 *
 * Uses rename() for same-device moves (atomic).
 * Falls back to copy+delete for cross-device (EXDEV error).
 * Retries on Windows EPERM errors (file locking).
 *
 * This is the low-level primitive used by atomicWrite and other operations.
 *
 * @param src - Source path
 * @param dest - Destination path
 */
export async function atomicRename(src: string, dest: string): Promise<void> {
  const maxRetries = 3;
  const retryDelay = 100; // ms

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rename(src, dest);
      return; // Success
    } catch (err: unknown) {
      if (!(err instanceof Error && 'code' in err)) {
        throw err;
      }

      const code = (err as NodeJS.ErrnoException).code;

      // Handle cross-device move (e.g., temp in C: target in D:)
      if (code === 'EXDEV') {
        await copyFile(src, dest);
        await unlink(src).catch(() =>
          console.warn('⚠️ [FileSystem] Failed to clean up temp file after cross-device copy'),
        );
        return;
      }

      // Handle Windows file locking (EPERM, EBUSY, EACCES)
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < maxRetries) {
        // Wait briefly and retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }

      // All retries exhausted or non-retryable error
      throw err;
    }
  }
}

/**
 * Check if file exists.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes.
 */
export async function getFileSize(path: string): Promise<number> {
  const stats = await stat(path);
  return stats.size;
}

/**
 * Check if path is a directory.
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file.
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}
