import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
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
      // Integration test that needs a live LLM API configuration.
      // (e2e.test.ts is fully mocked, so it runs in CI — do not exclude it.)
      'src/agent/Agent-integration.test.ts',
    ],
    globalSetup: './vitest.setup.ts',
    setupFiles: ['./vitest.isolate.ts'],
    coverage: {
      provider: 'v8',
      // Include EVERYTHING under src/. Excluding the modules with weak tests
      // (qt, experimental) made the headline number flattering but meaningless.
      // An honest 65% is worth more than a curated 77%.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.bench.ts',
        'src/index.ts',
        'src/codeyangx.ts',
        'src/web-server.ts',
        'src/commands.ts',
        'src/bridge/types.ts',
        'src/sandbox/sandbox-runner.js',
        'src/tools/semantic-index.ts',
        'src/utils/testHelpers.ts',
      ],
      // Measured over ALL of src/ (including qt and experimental):
      //   statements 75.95%, branches 79.14%, functions 86.33%, lines 75.95%
      //
      // Earlier configs excluded qt/ and experimental/ from `include`, which
      // reported a flattering 76.7%. With them included the real number is very
      // close (75.95%) — those modules had more tests than the old TODO comment
      // claimed. Never re-exclude a directory just to hit a target.
      //
      // Thresholds sit ~1% below measured values: enough to catch regressions,
      // loose enough not to fail on incidental drift.
      thresholds: {
        statements: 75,
        branches: 78,
        functions: 85,
        lines: 75,
      },
      // Fail CI if thresholds not met
      reportOnFailure: true,
    },
    // Ensure test files are found on Windows with absolute paths
    root: __dirname,
    // For Windows: force POSIX-style path separators in test file matching
    forceExit: true,
    // Cap parallelism: several suites shell out to real `git`/`npx tsc`/`npx
    // eslint` or do heavy fs I/O. Uncapped (one worker per core) starves them on
    // Windows, causing wall-clock timeouts and flaky failures.
    maxWorkers: 4,
    minWorkers: 1,
  },
});
