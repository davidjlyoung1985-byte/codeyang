#!/usr/bin/env node
/**
 * CodeYangX — Desktop AI Coding Agent
 * Launches the Electron app. Uses the standard Electron bootstrap.
 *
 * Usage: codeyangx
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// The Electron app main process
const mainJs = join(projectRoot, 'codeyangx', 'main.js');

if (!existsSync(mainJs)) {
  console.error(`CodeYangX: main.js not found at ${mainJs}`);
  process.exit(1);
}

// Find electron binary
function findElectron(): string {
  // Local install
  const local = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  if (existsSync(local)) return local;

  // Fallback: rely on PATH
  return process.platform === 'win32' ? 'electron.cmd' : 'electron';
}

const electronBin = findElectron();

console.log('CodeYangX v0.3.0');
console.log('Launching desktop window...\n');

const child = spawn(electronBin, [mainJs], {
  stdio: 'ignore',
  env: { ...process.env },
  detached: true,
});

child.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'ENOENT') {
    console.error('Electron not found. Run: npm install electron');
  } else {
    console.error(`Failed to start: ${err.message}`);
  }
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

// Detach so the terminal is free
child.unref();

// Give it a moment to start
setTimeout(() => {
  console.log('Desktop window should be open. You can close this terminal.');
}, 1500);
