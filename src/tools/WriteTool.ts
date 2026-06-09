import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveSafePath } from './shared.js';

export async function executeWrite(filePath: string, content: string): Promise<string> {
  const resolved = resolveSafePath(filePath);

  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, 'utf-8');

  return `Written ${content.length} bytes to ${filePath}`;
}
