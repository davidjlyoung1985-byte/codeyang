import { writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveSafePath } from './shared.js';
import { toolError } from './errors.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { captureFile } from '../utils/snapshot.js';

const MAX_WRITE_SIZE = 100 * 1024 * 1024; // 100 MB limit for writes

// Protected files that should never be overwritten to prevent accidental corruption or credential leakage
const PROTECTED_FILES = [
  // Environment files
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  // Lock files
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  // SSH keys
  'id_rsa',
  'id_rsa.pub',
  'id_ed25519',
  'id_ed25519.pub',
  'id_ecdsa',
  'id_ecdsa.pub',
  // SSL/TLS certificates and keys
  '*.pem',
  '*.key',
  '*.crt',
  '*.cer',
  // Package manager credentials
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  // Cloud service credentials
  'credentials.json',
  'service-account.json',
  'gcloud-key.json',
  // Common secret files
  'secrets.json',
  'config.prod.json',
  'config.production.json',
];

function isProtectedFile(filePath: string): boolean {
  const basename = filePath.split(/[/\\]/).pop() || '';

  // Exact match
  if (PROTECTED_FILES.includes(basename)) {
    return true;
  }

  // Pattern match for wildcards (*.pem, *.key, etc.)
  for (const pattern of PROTECTED_FILES) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(basename)) {
        return true;
      }
    }
  }

  return false;
}

export async function executeWrite(filePath: string, content: string): Promise<string> {
  checkRateLimit('file');

  const resolved = resolveSafePath(filePath);

  // Protect sensitive files from accidental overwrite
  if (isProtectedFile(filePath)) {
    const basename = filePath.split(/[/\\]/).pop() || '';
    throw new Error(
      toolError(
        'Write',
        `Cannot write to protected file: ${basename}`,
        'This file is protected to prevent accidental corruption or credential leakage.',
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

  const dir = dirname(resolved);
  await mkdir(dir, { recursive: true });

  // Snapshot before mutating so /undo covers Write (creates and overwrites alike).
  try {
    await captureFile(resolved, 'Write');
  } catch (err) {
    // A failed snapshot must not block the write, but it must be visible:
    // subsequent /undo for this change will not be available.
    console.warn(`⚠️  Could not snapshot ${filePath} for undo: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Atomic write: write to a temporary file first, then rename to target path.
  // This prevents data loss if the write is interrupted (crash, power loss, etc.).
  const tmpPath = resolve(dir, `.tmp-${randomUUID()}`);
  try {
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, resolved);
  } catch (err) {
    // Clean up temp file on failure
    try {
      await import('node:fs/promises').then((m) => m.unlink(tmpPath));
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }

  return `Written ${content.length} bytes to ${filePath}`;
}
