#!/usr/bin/env node
/**
 * Build `vscode-extension/tools.cjs` from `src/tools/`.
 *
 * Why this exists: `vscode-extension/tools.cjs` is a 573 KB esbuild bundle that
 * was committed to git with no script to regenerate it. Nothing could rebuild
 * it, so it could silently drift from the TypeScript sources — and nobody could
 * tell by looking at a diff of minified code.
 *
 * Now it is a build artifact: `npm run build:extension-tools`.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { statSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src/tools/extension-exports.ts');
const outfile = join(root, 'vscode-extension/tools.cjs');

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: false,
  minify: false,
  // Node built-ins and heavy optional deps stay external; the extension host
  // already has node built-ins, and bundling better-sqlite3 would fail.
  external: ['vscode', 'better-sqlite3', 'ws'],
  logLevel: 'info',
  metafile: true,
});

const out = Object.values(result.metafile.outputs)[0];
const size = statSync(outfile).size;
console.log(`\nbuilt ${outfile}`);
console.log(`  ${(size / 1024).toFixed(1)} KB, ${out.bytes} bytes reported by esbuild`);
console.log(`  inputs: ${Object.keys(result.metafile.inputs).length} modules`);
