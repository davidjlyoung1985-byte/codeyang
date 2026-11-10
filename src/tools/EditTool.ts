import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolveSafePath } from './shared.js';
import { fileNotFound, toolError } from './errors.js';
import { captureFile } from '../utils/snapshot.js';

// 基于文件路径的异步互斥锁，防止同一文件并发编辑导致竞态条件
const editLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  // 等待已有锁释放
  while (editLocks.has(filePath)) {
    try {
      await editLocks.get(filePath);
    } catch {
      // 忽略前一个操作的错误
    }
  }

  // 创建新锁
  let resolveLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  editLocks.set(filePath, lockPromise);

  try {
    return await fn();
  } finally {
    editLocks.delete(filePath);
    resolveLock!();
  }
}

export async function executeEdit(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll?: boolean,
): Promise<string> {
  const resolved = resolveSafePath(filePath);

  // 使用文件锁防止并发编辑同一文件导致竞态条件
  return withFileLock(resolved, async () => {
    try {
      await stat(resolved);
    } catch {
      throw new Error(fileNotFound(filePath));
    }

    // Save current content to the unified snapshot layer before modifying,
    // so /undo works uniformly for Edit/Write/Delete/Move and survives restarts.
    const currentContent = await readFile(resolved, 'utf-8');
    await captureFile(resolved, 'Edit');

    const content = currentContent;

    if (replaceAll) {
      if (!content.includes(oldString)) {
        throw new Error(toolError('Edit', `oldString not found in ${filePath}`, 'Verify the exact text to replace.'));
      }
      const beforeCount = countMatches(content, oldString);
      const updated = content.replaceAll(oldString, newString);
      await writeFile(resolved, updated, 'utf-8');

      // Verify the write was applied correctly
      const verify = await readFile(resolved, 'utf-8');
      const afterCount = countMatches(verify, oldString);
      if (afterCount > 0) {
        throw new Error(
          toolError(
            'Edit',
            `Replace verification failed: ${afterCount} occurrence(s) of oldString remain in ${filePath}`,
            'Unexpected — file content may be stale.',
          ),
        );
      }

      return `Replaced ${beforeCount} occurrence(s) in ${filePath}`;
    }

    // Single replace — must match exactly once
    const idx = content.indexOf(oldString);
    if (idx === -1) {
      throw new Error(toolError('Edit', `oldString not found in ${filePath}`, 'Verify the exact text to replace.'));
    }
    if (content.indexOf(oldString, idx + 1) !== -1) {
      throw new Error(
        toolError(
          'Edit',
          `Found multiple matches for oldString in ${filePath}`,
          'Provide more surrounding context or use replaceAll.',
        ),
      );
    }

    const updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length);
    await writeFile(resolved, updated, 'utf-8');

    // Verify write took effect
    const verify = await readFile(resolved, 'utf-8');
    if (!verify.includes(newString) && newString.length > 0) {
      throw new Error(
        toolError(
          'Edit',
          `Replace verification failed: newString not found in ${filePath}`,
          'Unexpected — file may be read-only.',
        ),
      );
    }

    return `Edited ${filePath} (1 occurrence)`;
  }); // end withFileLock
}

/**
 * Count non-overlapping occurrences of a substring
 */
function countMatches(str: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}
