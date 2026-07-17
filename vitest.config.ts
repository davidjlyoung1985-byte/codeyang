import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 增加全局测试超时到 30 秒
    hookTimeout: 30000,
    include: ['src/**/*.test.ts', 'src/**/*.bench.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/**/*.bench.ts',
        'src/bridge/',
        'src/sandbox/',
        'src/tot/',
        'src/mcp/',
        'src/tools/semantic-index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80,
      },
    },
  },
});
