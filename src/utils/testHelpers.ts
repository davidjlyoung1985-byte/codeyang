/**
 * Test utilities for creating isolated test environments
 *
 * Ensures tests use temporary directories instead of polluting ~/.codeyang/
 */

import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDirCounter = 0;
const testDirs: string[] = [];

/**
 * Create an isolated temporary directory for testing
 *
 * @param prefix - Optional prefix for the directory name
 * @returns Absolute path to the temporary directory
 */
export async function createTestDir(prefix = 'codeyang-test'): Promise<string> {
  const timestamp = Date.now();
  const counter = testDirCounter++;
  const dirName = `${prefix}-${timestamp}-${counter}`;
  const testDir = join(tmpdir(), dirName);

  await mkdir(testDir, { recursive: true });
  testDirs.push(testDir);

  return testDir;
}

/**
 * Clean up a specific test directory
 *
 * @param testDir - Path to the test directory to clean up
 */
export async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
    const index = testDirs.indexOf(testDir);
    if (index > -1) {
      testDirs.splice(index, 1);
    }
  } catch (err) {
    // Ignore cleanup errors
    if (process.env.CODEYANG_DEBUG) {
      console.warn(`Failed to clean up test dir ${testDir}:`, err);
    }
  }
}

/**
 * Clean up all test directories created in this session
 *
 * Should be called in afterAll() or test teardown
 */
export async function cleanupAllTestDirs(): Promise<void> {
  await Promise.all(testDirs.map((dir) => cleanupTestDir(dir)));
  testDirs.length = 0;
}

/**
 * Override environment variable for test isolation
 *
 * Returns a cleanup function to restore the original value
 */
export function withEnv(key: string, value: string | undefined): () => void {
  const original = process.env[key];

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  return () => {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  };
}

/**
 * Create a test session directory structure
 *
 * @param baseDir - Base directory (usually from createTestDir)
 * @returns Object with paths to common directories
 */
export async function createTestSessionDirs(baseDir: string): Promise<{
  sessions: string;
  memory: string;
  undo: string;
  plans: string;
}> {
  const sessions = join(baseDir, 'sessions');
  const memory = join(baseDir, 'memory');
  const undo = join(baseDir, 'undo');
  const plans = join(baseDir, 'plans');

  await Promise.all([
    mkdir(sessions, { recursive: true }),
    mkdir(memory, { recursive: true }),
    mkdir(undo, { recursive: true }),
    mkdir(plans, { recursive: true }),
  ]);

  return { sessions, memory, undo, plans };
}
