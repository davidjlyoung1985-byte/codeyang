import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolveSafePath } from './shared.js';

export async function executeEdit(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll?: boolean,
): Promise<string> {
  const resolved = resolveSafePath(filePath);

  try {
    await stat(resolved);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await readFile(resolved, 'utf-8');

  if (replaceAll) {
    if (!content.includes(oldString)) {
      throw new Error(`oldString not found in ${filePath}`);
    }
    const beforeCount = countMatches(content, oldString);
    const updated = content.replaceAll(oldString, newString);
    await writeFile(resolved, updated, 'utf-8');

    // Verify the write was applied correctly
    const verify = await readFile(resolved, 'utf-8');
    const afterCount = countMatches(verify, oldString);
    if (afterCount > 0) {
      throw new Error(`Replace verification failed: ${afterCount} occurrence(s) of oldString remain in ${filePath}`);
    }

    return `Replaced ${beforeCount} occurrence(s) in ${filePath}`;
  }

  // Single replace — must match exactly once
  const idx = content.indexOf(oldString);
  if (idx === -1) {
    throw new Error(`oldString not found in ${filePath}`);
  }
  if (content.indexOf(oldString, idx + 1) !== -1) {
    throw new Error(
      `Found multiple matches for oldString in ${filePath}. Provide more surrounding context or use replaceAll.`,
    );
  }

  const updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length);
  await writeFile(resolved, updated, 'utf-8');

  // Verify write took effect
  const verify = await readFile(resolved, 'utf-8');
  if (!verify.includes(newString) && newString.length > 0) {
    throw new Error(`Replace verification failed: newString not found in ${filePath}.`);
  }

  return `Edited ${filePath} (1 occurrence)`;
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
