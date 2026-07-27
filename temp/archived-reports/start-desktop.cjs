#!/usr/bin/env node
/**
 * CodeYangX Desktop Launcher
 * Starts Electron with proper module resolution from project root
 */
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');
const mainScript = path.join(__dirname, 'codeyangx', 'main.js');

console.log('Starting CodeYangX Desktop...');
console.log('Electron:', electronPath);
console.log('Main:', mainScript);

const child = spawn(electronPath, [mainScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code || 0);
});
