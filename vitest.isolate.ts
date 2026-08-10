/**
 * Vitest isolation setup — runs inside each worker before test files load.
 *
 * Points CODYANG_HOME at an isolated temp directory so that tests never read
 * from or write to the real `~/.codeyang/` (sessions, memory, tasks, config,
 * bridge state, rl-weights, cache, permissions, todos, ...).
 *
 * NOTE: This works because the source modules resolve their data directory via
 * `utils/paths.ts` (which re-reads process.env.CODEYANG_HOME on every call),
 * NOT via `os.homedir()` (which is cached per-process).
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isolatedHome = mkdtempSync(join(tmpdir(), 'codeyang-home-'));

process.env.CODEYANG_HOME = isolatedHome;

// Expose the path for teardown cleanup in vitest.setup.ts
(globalThis as { __CODEYANG_TEST_HOME__?: string }).__CODEYANG_TEST_HOME__ = isolatedHome;
