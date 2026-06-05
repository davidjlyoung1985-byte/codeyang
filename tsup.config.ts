import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', codeyangx: 'src/codeyangx.ts' },
    format: ['esm'],
    clean: true,
    sourcemap: true,
    dts: true,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    shims: true,
    noExternal: [],
    external: ['eslint'],
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
  },
]);
