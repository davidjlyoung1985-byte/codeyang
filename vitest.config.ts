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
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', 'src/**/*.bench.ts'],
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
        'src/math/**/*.ts',
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
      // Current coverage (core modules only, experimental excluded):
      // statements 64.92%, branches 52.66%, functions 68.08%, lines 66.38%
      // Set thresholds at achievable levels with room for improvement
      thresholds: {
        statements: 64,
        branches: 52,
        functions: 67,
        lines: 65,
      },
      // Fail CI if thresholds not met
      reportOnFailure: true,
    },
    // Ensure test files are found on Windows with absolute paths
    root: __dirname,
    // For Windows: force POSIX-style path separators in test file matching
    forceExit: true,
  },
});
