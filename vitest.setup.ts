/**
 * Vitest global setup
 *
 * Runs once before all test files
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

export async function setup() {
  console.log('[Test Setup] Cleaning test environment...');

  // Clean up any leftover test directories in ~/.codeyang/
  const codeyangDir = join(homedir(), '.codeyang');

  try {
    // Remove test sessions
    await rm(join(codeyangDir, 'sessions', 'test-*'), { recursive: true, force: true }).catch(() => {});

    // Remove test memory files
    await rm(join(codeyangDir, 'memory', 'test-*'), { recursive: true, force: true }).catch(() => {});

    // Remove test undo files
    await rm(join(codeyangDir, 'undo', 'test-*'), { recursive: true, force: true }).catch(() => {});

    console.log('[Test Setup] Test environment cleaned');
  } catch (err) {
    console.warn('[Test Setup] Failed to clean test environment:', err);
  }
}

export async function teardown() {
  console.log('[Test Teardown] Final cleanup...');

  // Clean up temporary test directories
  const tmpDir = tmpdir();
  try {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(tmpDir);

    for (const entry of entries) {
      if (entry.startsWith('codeyang-test-') || entry.startsWith('codeyang-home-')) {
        await rm(join(tmpDir, entry), { recursive: true, force: true }).catch(() => {});
      }
    }

    console.log('[Test Teardown] Cleanup complete');
  } catch (err) {
    console.warn('[Test Teardown] Failed to clean temporary directories:', err);
  }
}
