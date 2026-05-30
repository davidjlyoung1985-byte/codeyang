import { readFile, stat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';

export async function executeRead(filePath: string, offset?: number, limit?: number): Promise<string> {
  const resolved = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);

  try {
    await stat(resolved);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await readFile(resolved, 'utf-8');
  const lines = content.split('\n');

  if (offset !== undefined) {
    const start = offset;
    const end = limit !== undefined ? start + limit : lines.length;
    const selected = lines.slice(start, end);
    return selected.map((l, i) => `${start + i + 1}: ${l}`).join('\n');
  }

  return content;
}
