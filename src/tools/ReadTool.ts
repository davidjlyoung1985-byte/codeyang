import { readFile, stat, readdir } from 'node:fs/promises';
import { resolveSafePath } from './shared.js';
import { fileNotFound } from './errors.js';

export async function executeRead(filePath: string, offset?: number, limit?: number): Promise<string> {
  const resolved = resolveSafePath(filePath);

  let stats;
  try {
    stats = await stat(resolved);
  } catch {
    throw new Error(fileNotFound(filePath));
  }

  // Directory listing
  if (stats.isDirectory()) {
    const entries = await readdir(resolved, { withFileTypes: true });
    const lines: string[] = [];
    // Directories first, then files, sorted alphabetically
    const sorted = [...entries].sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of sorted) {
      const suffix = entry.isDirectory() ? '/' : '';
      lines.push(`${entry.name}${suffix}`);
    }
    const total = entries.length;
    const dirs = entries.filter((e) => e.isDirectory()).length;
    const files = total - dirs;
    return lines.length > 0
      ? `${lines.join('\n')}\n\n${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`
      : '(empty directory)';
  }

  // File reading
  const content = await readFile(resolved, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (offset !== undefined) {
    const start = offset;
    const end = limit !== undefined ? start + limit : totalLines;
    const selected = lines.slice(start, end);
    const shown = selected.length;
    const header = `(Lines ${start + 1}-${start + shown} of ${totalLines})\n`;
    return header + selected.map((l, i) => `${start + i + 1}: ${l}`).join('\n');
  }

  return content;
}
