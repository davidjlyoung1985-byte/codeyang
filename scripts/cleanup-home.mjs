#!/usr/bin/env node

/**
 * Clean up legacy ~/.codeyang directory from test pollution
 *
 * Background:
 * - Tests used to write directly to ~/.codeyang (before CODEYANG_HOME was added)
 * - Left 756 files (178 MB) of test artifacts in user's home directory
 * - Tests now use isolated temp directories
 *
 * This script safely removes old test artifacts while preserving any real data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE;
const CODEYANG_DIR = path.join(HOME, '.codeyang');

interface Stats {
  sessions: number;
  tasks: number;
  memories: number;
  configs: number;
  totalFiles: number;
  totalSize: number;
  oldestDate: Date | null;
  newestDate: Date | null;
}

async function analyzeDirectory(): Promise<Stats> {
  const stats: Stats = {
    sessions: 0,
    tasks: 0,
    memories: 0,
    configs: 0,
    totalFiles: 0,
    totalSize: 0,
    oldestDate: null,
    newestDate: null,
  };

  if (!fs.existsSync(CODEYANG_DIR)) {
    return stats;
  }

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        stats.totalFiles++;
        const stat = fs.statSync(fullPath);
        stats.totalSize += stat.size;

        // Track oldest/newest
        if (!stats.oldestDate || stat.mtime < stats.oldestDate) {
          stats.oldestDate = stat.mtime;
        }
        if (!stats.newestDate || stat.mtime > stats.newestDate) {
          stats.newestDate = stat.mtime;
        }

        // Categorize
        if (fullPath.includes('/sessions/')) stats.sessions++;
        else if (fullPath.includes('/tasks/')) stats.tasks++;
        else if (fullPath.includes('/memories/')) stats.memories++;
        else if (entry.name.endsWith('.json')) stats.configs++;
      }
    }
  }

  walkDir(CODEYANG_DIR);
  return stats;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function backupDirectory(): Promise<string | null> {
  const backupPath = `${CODEYANG_DIR}.backup-${Date.now()}`;

  try {
    fs.cpSync(CODEYANG_DIR, backupPath, { recursive: true });
    return backupPath;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    return null;
  }
}

async function cleanDirectory(stats: Stats, keepMemories: boolean): Promise<void> {
  console.log('\n🧹 Cleaning...');

  // Remove sessions and tasks (definitely test pollution)
  const sessionsDir = path.join(CODEYANG_DIR, 'sessions');
  const tasksDir = path.join(CODEYANG_DIR, 'tasks');

  if (fs.existsSync(sessionsDir)) {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
    console.log(`  ✓ Removed ${stats.sessions} session files`);
  }

  if (fs.existsSync(tasksDir)) {
    fs.rmSync(tasksDir, { recursive: true, force: true });
    console.log(`  ✓ Removed ${stats.tasks} task files`);
  }

  // Optionally keep memories
  if (!keepMemories) {
    const memoriesDir = path.join(CODEYANG_DIR, 'memories');
    if (fs.existsSync(memoriesDir)) {
      fs.rmSync(memoriesDir, { recursive: true, force: true });
      console.log(`  ✓ Removed ${stats.memories} memory files`);
    }
  }

  // Check if directory is now empty
  const remaining = fs.readdirSync(CODEYANG_DIR);
  if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === 'memories')) {
    console.log('  ℹ Directory is now clean');
  } else {
    console.log(`  ℹ ${remaining.length} items remain (likely config files)`);
  }
}

async function main() {
  console.log('🔍 CodeYang Home Directory Cleanup\n');
  console.log(`Analyzing: ${CODEYANG_DIR}\n`);

  const stats = await analyzeDirectory();

  if (stats.totalFiles === 0) {
    console.log('✨ Directory is already clean or does not exist');
    return;
  }

  // Display analysis
  console.log('📊 Current state:');
  console.log(`  Sessions:    ${stats.sessions.toLocaleString()} files`);
  console.log(`  Tasks:       ${stats.tasks.toLocaleString()} files`);
  console.log(`  Memories:    ${stats.memories.toLocaleString()} files`);
  console.log(`  Configs:     ${stats.configs.toLocaleString()} files`);
  console.log(`  Total:       ${stats.totalFiles.toLocaleString()} files (${(stats.totalSize / 1024 / 1024).toFixed(2)} MB)`);

  if (stats.oldestDate && stats.newestDate) {
    console.log(`  Date range:  ${stats.oldestDate.toISOString().split('T')[0]} → ${stats.newestDate.toISOString().split('T')[0]}`);
  }

  console.log('\n⚠️  This appears to be test pollution from before CODEYANG_HOME was added.');
  console.log('    Tests now use isolated directories and won\'t pollute your home.');

  // Ask for confirmation
  const shouldClean = await confirm('\nRemove sessions and tasks directories?');
  if (!shouldClean) {
    console.log('Cancelled.');
    return;
  }

  const keepMemories = stats.memories > 0
    ? !(await confirm('Also remove memories? (You may want to keep these)'))
    : false;

  // Create backup
  console.log('\n💾 Creating backup...');
  const backupPath = await backupDirectory();
  if (!backupPath) {
    console.log('Backup failed. Aborting for safety.');
    return;
  }
  console.log(`  ✓ Backup created: ${backupPath}`);

  // Clean
  await cleanDirectory(stats, keepMemories);

  // Final stats
  const after = await analyzeDirectory();
  const freed = (stats.totalSize - after.totalSize) / 1024 / 1024;

  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Freed: ${freed.toFixed(2)} MB`);
  console.log(`   Backup: ${backupPath}`);
  console.log('\n   You can safely delete the backup after verifying everything works.');
}

main().catch(console.error);
