import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveSafePath } from './shared.js';
import { toolError } from './errors.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

const MAX_WRITE_SIZE = 100 * 1024 * 1024; // 100 MB limit for writes

// 不允许覆盖的敏感项目文件
const PROTECTED_FILES = ['.env', '.env.local', '.env.production', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

export async function executeWrite(filePath: string, content: string): Promise<string> {
  checkRateLimit('file');

  const resolved = resolveSafePath(filePath);

  // 保护敏感配置文件不被意外覆盖
  const basename = filePath.split(/[/\\]/).pop() || '';
  if (PROTECTED_FILES.includes(basename)) {
    throw new Error(
      toolError(
        'Write',
        `Cannot write to protected file: ${basename}`,
        'This file is protected to prevent accidental corruption.',
      ),
    );
  }

  // Enforce write size limit to prevent memory exhaustion
  const contentSize = Buffer.byteLength(content, 'utf-8');
  if (contentSize > MAX_WRITE_SIZE) {
    throw new Error(
      toolError(
        'Write',
        `Content size ${(contentSize / 1024 / 1024).toFixed(1)} MB exceeds maximum ${MAX_WRITE_SIZE / 1024 / 1024} MB`,
        'Use streaming or split the content into smaller files.',
      ),
    );
  }

  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, 'utf-8');

  return `Written ${content.length} bytes to ${filePath}`;
}
