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
      // Skip integration and E2E tests that require LLM API configuration
      'src/agent/Agent-integration.test.ts',
      'src/e2e/e2e.test.ts',
    ],
    globalSetup: './vitest.setup.ts',
    setupFiles: ['./vitest.isolate.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/agent/**/*.ts',
        'src/tools/**/*.ts',
        'src/mcp/**/*.ts',
        'src/sandbox/**/*.ts',
        'src/security/**/*.ts',
        'src/permission/**/*.ts',
        'src/ui/**/*.ts',
        'src/utils/**/*.ts',
        'src/config/**/*.ts',
        'src/tracing/**/*.ts',
        'src/gateway/**/*.ts',
        'src/planner/**/*.ts',
        'src/circuit-breaker/**/*.ts',
        'src/bridge/**/*.ts',
        // Include experimental modules with decent test coverage
        'src/tot/**/*.ts',
        'src/a2a/**/*.ts',
        'src/closed-loop/**/*.ts',
      ],
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
      // Current coverage (core + selected extended modules, see `include`):
      // statements 76.6%, branches 80.0%, functions 86.0%, lines 76.6%
      // Thresholds sit ~1-2 points below actual to gate real regressions
      // without flaking on minor variance.
      thresholds: {
        statements: 75,
        branches: 78,
        functions: 84,
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
