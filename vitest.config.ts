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
    include: ['src/**/*.test.ts', 'src/**/*.bench.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    globalSetup: './vitest.setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.bench.ts',
        'src/index.ts',
        'src/bridge/types.ts',
        'src/sandbox/sandbox-runner.js',
        'src/tools/semantic-index.ts',
        // src/tot/ and src/mcp/ have basic tests — keep included
      ],
      thresholds: {
        statements: 60,
        branches: 45,
        functions: 60,
        lines: 60,
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
