/**
 * MultiEdit — apply several exact-text replacements to one file atomically.
 *
 * Why it exists: changing three separated spots in one file otherwise costs
 * three `Edit` calls, i.e. three LLM round-trips. MultiEdit does it in one, and
 * because it is all-or-nothing it cannot leave a half-edited file behind.
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolveSafePath } from './shared.js';
import { fileNotFound, toolError } from './errors.js';
import { captureFile } from '../utils/snapshot.js';

export interface MultiEditOperation {
  oldString: string;
  newString: string;
  /** Replace every occurrence instead of requiring a unique match. */
  replaceAll?: boolean;
}

function countMatches(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Apply edits sequentially to `content`, validating each one.
 * Throws before writing anything if any edit is invalid.
 */
export function applyMultiEdit(content: string, edits: MultiEditOperation[]): { result: string; applied: number } {
  let working = content;

  for (let i = 0; i < edits.length; i++) {
    const { oldString, newString, replaceAll } = edits[i];
    const position = i + 1;

    if (typeof oldString !== 'string' || oldString.length === 0) {
      throw new Error(
        toolError('MultiEdit', `Edit #${position} has an empty oldString`, 'Each edit needs the exact text to find.'),
      );
    }
    if (typeof newString !== 'string') {
      throw new Error(
        toolError('MultiEdit', `Edit #${position} has a non-string newString`, 'Provide a string to insert.'),
      );
    }
    if (oldString === newString) {
      throw new Error(
        toolError(
          'MultiEdit',
          `Edit #${position} is a no-op (oldString === newString)`,
          'Remove this edit or change the replacement.',
        ),
      );
    }

    const occurrences = countMatches(working, oldString);

    if (occurrences === 0) {
      throw new Error(
        toolError(
          'MultiEdit',
          `Edit #${position}: oldString not found`,
          'Edits are applied in order, so an earlier edit may have already changed this region. Read the file again and re-plan.',
        ),
      );
    }

    if (occurrences > 1 && !replaceAll) {
      throw new Error(
        toolError(
          'MultiEdit',
          `Edit #${position}: oldString appears ${occurrences} times`,
          'Add more surrounding context to make it unique, or set replaceAll: true.',
        ),
      );
    }

    working = replaceAll ? working.replaceAll(oldString, newString) : working.replace(oldString, newString);
  }

  return { result: working, applied: edits.length };
}

export async function executeMultiEdit(filePath: string, edits: MultiEditOperation[]): Promise<string> {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error(toolError('MultiEdit', 'No edits provided', 'Pass at least one {oldString, newString} pair.'));
  }

  const resolved = resolveSafePath(filePath);

  try {
    await stat(resolved);
  } catch {
    throw new Error(fileNotFound(filePath));
  }

  const original = await readFile(resolved, 'utf-8');

  // Validate everything before touching disk: a partial multi-edit is worse
  // than no edit at all.
  const { result, applied } = applyMultiEdit(original, edits);

  if (result === original) {
    return `No changes: ${filePath} was already in the requested state`;
  }

  // Snapshot once for the whole batch, so /undo reverts all edits together.
  await captureFile(resolved, 'MultiEdit');

  await writeFile(resolved, result, 'utf-8');

  // Verify against the final state, not against each intermediate step.
  const verify = await readFile(resolved, 'utf-8');
  if (verify !== result) {
    throw new Error(
      toolError('MultiEdit', 'Write verification failed: file content differs after write', 'Retry the operation.'),
    );
  }

  const delta = result.length - original.length;
  const sign = delta >= 0 ? '+' : '';
  return `Applied ${applied} edit(s) to ${filePath} (${sign}${delta} bytes)`;
}
