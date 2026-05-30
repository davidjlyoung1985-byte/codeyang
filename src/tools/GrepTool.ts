import { readFile, stat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { readdir } from 'node:fs/promises';

export async function executeGrep(pattern: string, include?: string, path?: string): Promise<string> {
  const base = path ? (isAbsolute(path) ? path : join(process.cwd(), path)) : process.cwd();
  const results: { file: string; lines: string[] }[] = [];

  const regex = new RegExp(pattern, 'i');
  const includeRegex = include ? new RegExp(include.replace(/\*/g, '.*')) : null;

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(full);
        }
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(entry.name)) continue;
        try {
          const content = await readFile(full, 'utf-8');
          const lines = content.split('\n');
          const matches: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push(`${i + 1}: ${lines[i].trim()}`);
            }
          }
          if (matches.length > 0) {
            const relPath = full.replace(base, '').replace(/^[/\\]/, '');
            results.push({ file: relPath, lines: matches.slice(0, 20) });
          }
        } catch {}
      }
    }
  }

  await walk(base);
  if (results.length === 0) return '(no matches)';

  return results.map(r => {
    return `${r.file}\n${r.lines.join('\n')}`;
  }).join('\n\n');
}
