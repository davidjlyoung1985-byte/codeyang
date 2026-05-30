import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { join, isAbsolute, dirname } from 'node:path';

export async function executeEdit(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll?: boolean,
): Promise<string> {
  const resolved = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);

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
    const updated = content.replaceAll(oldString, newString);
    await writeFile(resolved, updated, 'utf-8');
    const count = (content.match(new RegExp(escapeRegex(oldString), 'g')) || []).length;
    return `Replaced ${count} occurrence(s) in ${filePath}`;
  }

  const idx = content.indexOf(oldString);
  if (idx === -1) {
    throw new Error(`oldString not found in ${filePath}`);
  }
  if (content.indexOf(oldString, idx + 1) !== -1) {
    throw new Error(`Found multiple matches for oldString in ${filePath}. Provide more surrounding context or use replaceAll.`);
  }

  const updated = content.replace(oldString, newString);
  await writeFile(resolved, updated, 'utf-8');
  return `Edited ${filePath} (1 occurrence)`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
