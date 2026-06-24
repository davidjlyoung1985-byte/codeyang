import { readFile, stat, readdir } from 'node:fs/promises';
import { resolveSafePath } from './shared.js';
import { fileNotFound, toolError } from './errors.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — larger files require offset/limit
const MAX_READ_RETRIES = 3; // 读取重试次数，应对临时文件锁定

/** 只对可重试的临时性错误进行重试（如 Windows 文件锁定），
 *  不会对 ENOENT（不存在）、EACCES（永久无权限）等错误重试 */
function isRetryableError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EBUSY' || code === 'EAGAIN' || code === 'EWOULDBLOCK' || code === 'EACCES';
  }
  return false;
}

async function readFileWithRetry(filePath: string, retries = MAX_READ_RETRIES): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await readFile(filePath, 'utf-8');
    } catch (err) {
      if (attempt === retries || !isRetryableError(err)) throw err;
      // 短暂等待后重试（应对 Windows 文件锁定）
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  throw new Error('Unexpected: readFileWithRetry exhausted');
}

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

  // File reading — enforce size limit to prevent OOM on huge files
  if (stats.size > MAX_FILE_SIZE && offset === undefined) {
    throw new Error(
      toolError(
        'Read',
        `File is ${(stats.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB). Use offset and limit to read specific sections.`,
      ),
    );
  }

  const content = await readFileWithRetry(resolved);
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
