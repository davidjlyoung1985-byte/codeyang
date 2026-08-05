import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      codeyangx: 'src/codeyangx.ts',
      'web-server': 'src/web-server.ts',
    },
    format: ['esm'],
    clean: true,
    sourcemap: true,
    dts: true,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    shims: true,
    splitting: true,
    external: ['eslint', 'typescript'],
    noExternal: [],
    alias: {
      '@': './src',
    },
  },
  // Sandbox runner (standalone, no splitting)
  {
    entry: {
      'sandbox/sandbox-runner': 'src/sandbox/sandbox-runner.ts',
    },
    format: ['esm'],
    clean: false,
    sourcemap: true,
    dts: true,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    shims: false, // No shims needed for standalone runner
    splitting: false, // Must be standalone
    bundle: false, // Don't bundle Node.js built-ins
  },
  // Shared tools (CJS) for VS Code extension
  {
    entry: { tools: 'src/tools/shared.ts' },
    format: ['cjs'],
    clean: false,
    sourcemap: true,
    outDir: 'dist/cjs',
    platform: 'node',
    target: 'node18',
    shims: true,
    alias: {
      '@': './src',
    },
  },
]);
