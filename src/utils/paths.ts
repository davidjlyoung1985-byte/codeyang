/**
 * Unified CodeYang data directory resolution.
 *
 * All modules that persist data under `~/.codeyang/` should use these helpers
 * instead of calling `homedir()` directly. This enables:
 *   - `CODYANG_HOME` override (users can relocate their data directory)
 *   - Test isolation (tests point CODYANG_HOME at a temp dir, never touching
 *     the real `~/.codeyang/`)
 *
 * NOTE: unlike `os.homedir()`, these helpers re-read the environment on every
 * call, so setting `CODYANG_HOME` at any time (e.g. in vitest setupFiles)
 * takes effect immediately.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve the CodeYang data directory (default: ~/.codeyang). */
export function getCodeyangHome(): string {
  return process.env.CODEYANG_HOME || join(homedir(), '.codeyang');
}

/** Resolve a path inside the CodeYang data directory. */
export function codeyangPath(...segments: string[]): string {
  return join(getCodeyangHome(), ...segments);
}
