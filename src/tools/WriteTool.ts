import { writeFile, mkdir } from 'node:fs/promises';
import { join, isAbsolute, dirname } from 'node:path';

export async function executeWrite(filePath: string, content: string): Promise<string> {
  const resolved = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);

  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, 'utf-8');

  return `Written ${content.length} bytes to ${filePath}`;
}
