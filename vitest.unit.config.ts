import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Fast config for the inner development loop.
 *
 * The full suite (`npm test`) takes ~100s, and five files account for 63% of
 * that — they spawn real `git`/`bash`/`pwsh` processes (GitTool alone runs 52
 * git invocations in 23s). Those are genuine integration tests and should keep
 * running in CI, but waiting 100s for every edit is what stops people running
 * tests at all.
 *
 * Usage:
 *   npm test            # full suite (CI + pre-push)
 *   npm run test:unit   # this config: fast feedback, no process spawns
 *
 * The excluded files are listed explicitly rather than by convention so that
 * adding a new slow test never silently drops it from the full run.
 */
export const SLOW_TEST_FILES = [
  'src/tools/GitTool.test.ts',
  'src/tools/BashTool.test.ts',
  'src/tools/PowerShellTool.test.ts',
  'src/agent/Agent.test.ts',
  'src/sandbox/sandbox-integration.test.ts',
  'src/sandbox/sandbox-runner.test.ts',
  'src/sandbox/os-isolation.test.ts',
  'src/sandbox/os-isolation.coverage.test.ts',
  'src/sandbox/os-isolation-windows.test.ts',
  'src/mcp/McpClient.test.ts',
  'src/mcp/McpManager.test.ts',
  'src/tools/mcp.test.ts',
  'src/e2e/e2e.test.ts',
];

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      'src/**/*.bench.ts',
      // Needs a live LLM API configuration - never runs in CI either.
      'src/agent/Agent-integration.test.ts',
      ...SLOW_TEST_FILES,
    ],
    globalSetup: './vitest.setup.ts',
    setupFiles: ['./vitest.isolate.ts'],
    root: __dirname,
    // Safe to raise here: the hang at maxWorkers=4 was in src/tools, and the
    // files that caused it are excluded above.
    maxWorkers: 4,
    minWorkers: 1,
  },
});
