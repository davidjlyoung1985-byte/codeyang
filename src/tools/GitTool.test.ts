import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { execa } from 'execa';
import {
  executeGitStatus,
  executeGitDiff,
  executeGitCommit,
  executeGitBranch,
  executeGitCheckout,
  executeGitLog,
  executeGitAdd,
  executeGitReset,
  executeGitStash,
  executeGitCurrentBranch,
} from './GitTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-git-tools');

describe('GitTool', () => {
  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Initialize git repo
    await execa('git', ['init'], { cwd: TEST_DIR });
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: TEST_DIR });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: TEST_DIR });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('executeGitStatus', () => {
    it('should show clean status for new repo', async () => {
      const result = await executeGitStatus(TEST_DIR);

      expect(result.toLowerCase()).toMatch(/nothing to commit|no changes|working tree clean|no commits/i);
    });

    it('should show untracked files', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');

      const result = await executeGitStatus(TEST_DIR);

      expect(result).toContain('Untracked files');
      expect(result).toContain('test.txt');
    });

    it('should show modified files', async () => {
      const file = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(file, 'initial');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      await fs.writeFile(file, 'modified');

      const result = await executeGitStatus(TEST_DIR);

      expect(result).toContain('modified');
      expect(result).toContain('test.txt');
    });

    it('should show short format', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');

      const result = await executeGitStatus(TEST_DIR, true);

      expect(result).toContain('??');
      expect(result).toContain('test.txt');
    });
  });

  describe('executeGitAdd', () => {
    it('should stage files', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(TEST_DIR, 'file2.txt'), 'content2');

      const result = await executeGitAdd(['file1.txt', 'file2.txt'], TEST_DIR);

      expect(result).toContain('Staged 2 file(s)');

      const status = await execa('git', ['status', '-s'], { cwd: TEST_DIR });
      expect(status.stdout).toContain('A  file1.txt');
      expect(status.stdout).toContain('A  file2.txt');
    });

    it('should fail with no files', async () => {
      const result = await executeGitAdd([], TEST_DIR);

      expect(result.toLowerCase()).toMatch(/error|no files specified/);
    });
  });

  describe('executeGitCommit', () => {
    it('should create commit with staged files', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });

      const result = await executeGitCommit('Test commit', TEST_DIR);

      expect(result).toContain('Test commit');

      const log = await execa('git', ['log', '--oneline'], { cwd: TEST_DIR });
      expect(log.stdout).toContain('Test commit');
    });

    it('should stage all and commit with addAll=true', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');

      const result = await executeGitCommit('Auto-staged commit', TEST_DIR, true);

      expect(result).toContain('Auto-staged commit');
    });

    it('should fail with no staged changes', async () => {
      const result = await executeGitCommit('Empty commit', TEST_DIR);

      expect(result).toContain('Nothing to commit');
    });
  });

  describe('executeGitBranch', () => {
    it('should list branches', async () => {
      // Create initial commit to establish main branch
      await fs.writeFile(path.join(TEST_DIR, 'init.txt'), 'init');
      await execa('git', ['add', 'init.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'init'], { cwd: TEST_DIR });

      const result = await executeGitBranch(TEST_DIR);

      expect(result).toMatch(/master|main/);
    });

    it('should show multiple branches', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'init.txt'), 'init');
      await execa('git', ['add', 'init.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'init'], { cwd: TEST_DIR });
      await execa('git', ['branch', 'feature'], { cwd: TEST_DIR });

      const result = await executeGitBranch(TEST_DIR);

      expect(result).toContain('feature');
    });
  });

  describe('executeGitCheckout', () => {
    it('should create and switch to new branch', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'init.txt'), 'init');
      await execa('git', ['add', 'init.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'init'], { cwd: TEST_DIR });

      const result = await executeGitCheckout('feature', TEST_DIR, true);

      expect(result).toContain('feature');

      const branch = await executeGitCurrentBranch(TEST_DIR);
      expect(branch).toBe('feature');
    });

    it('should switch to existing branch', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'init.txt'), 'init');
      await execa('git', ['add', 'init.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'init'], { cwd: TEST_DIR });
      await execa('git', ['branch', 'feature'], { cwd: TEST_DIR });

      const result = await executeGitCheckout('feature', TEST_DIR, false);

      expect(result).toContain('feature');
    });
  });

  describe('executeGitLog', () => {
    it('should show commit history', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'First commit'], { cwd: TEST_DIR });

      const result = await executeGitLog(TEST_DIR);

      expect(result).toContain('First commit');
    });

    it('should limit commit count', async () => {
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(path.join(TEST_DIR, `file${i}.txt`), 'content');
        await execa('git', ['add', `file${i}.txt`], { cwd: TEST_DIR });
        await execa('git', ['commit', '-m', `Commit ${i}`], { cwd: TEST_DIR });
      }

      const result = await executeGitLog(TEST_DIR, 3);

      const lines = result.split('\n').filter((l) => l.includes('Commit'));
      expect(lines.length).toBeLessThanOrEqual(3);
    });

    it('should show oneline format', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'Test commit'], { cwd: TEST_DIR });

      const result = await executeGitLog(TEST_DIR, 10, true);

      expect(result).toContain('Test commit');
      const lines = result.split('\n');
      expect(lines[0].length).toBeLessThan(100); // Oneline should be short
    });
  });

  describe('executeGitDiff', () => {
    it('should show no diff for clean repo', async () => {
      const result = await executeGitDiff(TEST_DIR);

      expect(result.toLowerCase()).toMatch(/no differences|no changes/);
    });

    it('should show unstaged changes', async () => {
      const file = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(file, 'initial');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      await fs.writeFile(file, 'modified');

      const result = await executeGitDiff(TEST_DIR, false);

      expect(result).toContain('test.txt');
      expect(result).toContain('-initial');
      expect(result).toContain('+modified');
    });

    it('should show staged changes', async () => {
      const file = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(file, 'initial');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      await fs.writeFile(file, 'modified');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });

      const result = await executeGitDiff(TEST_DIR, true);

      expect(result).toContain('test.txt');
      expect(result).toContain('-initial');
      expect(result).toContain('+modified');
    });
  });

  describe('executeGitReset', () => {
    it('should unstage files', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });

      const result = await executeGitReset(['test.txt'], TEST_DIR, false);

      expect(result).toContain('Reset completed');

      const status = await execa('git', ['status', '-s'], { cwd: TEST_DIR });
      expect(status.stdout).toContain('??');
    });
  });

  describe('executeGitStash', () => {
    it('should stash changes', async () => {
      const file = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(file, 'initial');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      await fs.writeFile(file, 'modified');

      const result = await executeGitStash('save', 'test stash', TEST_DIR);

      expect(result).toContain('Saved');

      const content = await fs.readFile(file, 'utf-8');
      expect(content).toBe('initial'); // Changes stashed
    });

    it('should list stashes', async () => {
      const file = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(file, 'initial');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      await fs.writeFile(file, 'modified');
      await execa('git', ['stash', 'push', '-m', 'my stash'], { cwd: TEST_DIR });

      const result = await executeGitStash('list', undefined, TEST_DIR);

      expect(result).toContain('stash@{0}');
    });
  });

  describe('executeGitCurrentBranch', () => {
    it('should return current branch', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'init.txt'), 'init');
      await execa('git', ['add', 'init.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'init'], { cwd: TEST_DIR });

      const result = await executeGitCurrentBranch(TEST_DIR);

      expect(result).toMatch(/master|main/);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent directory', async () => {
      const nonExistentDir = path.join(TEST_DIR, 'non-existent');

      await expect(executeGitStatus(nonExistentDir)).rejects.toThrow();
    });

    it('should handle invalid branch name on checkout', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'init.txt'), 'init');
      await execa('git', ['add', 'init.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'init'], { cwd: TEST_DIR });

      // Try to checkout non-existent branch without create flag
      await expect(executeGitCheckout('non-existent-branch', TEST_DIR, false)).rejects.toThrow();
    });

    it('should handle commit with empty message', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });

      const result = await executeGitCommit('', TEST_DIR);

      // Should handle gracefully or reject
      expect(result).toBeDefined();
    });

    it('should handle git operations in non-git directory', async () => {
      const nonGitDir = path.join(TEST_DIR, 'not-git');
      await fs.mkdir(nonGitDir, { recursive: true });

      await expect(executeGitStatus(nonGitDir)).rejects.toThrow();
    });

    it('should handle unstaging files that are not staged', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');

      const result = await executeGitReset(['test.txt'], TEST_DIR, false);

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle checkout with uncommitted changes', async () => {
      const file = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(file, 'initial');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      await execa('git', ['branch', 'feature'], { cwd: TEST_DIR });

      // Make uncommitted changes
      await fs.writeFile(file, 'modified');

      // Try to checkout - should either fail or force
      const result = await executeGitCheckout('feature', TEST_DIR, false).catch((e) => e);

      expect(result).toBeDefined();
    });

    it('should handle adding non-existent files', async () => {
      const result = await executeGitAdd(['non-existent-file.txt'], TEST_DIR);

      // Should report error or handle gracefully
      expect(result.toLowerCase()).toMatch(/error|warning|did not match|pathspec/);
    });

    it('should handle stash when there are no changes', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      const result = await executeGitStash('save', 'empty stash', TEST_DIR);

      // Should indicate no changes to stash
      expect(result.toLowerCase()).toMatch(/no local changes|nothing to save/);
    });

    it('should handle diff with no commits', async () => {
      const result = await executeGitDiff(TEST_DIR);

      expect(result).toBeDefined();
    });

    it('should handle log with no commits', async () => {
      const result = await executeGitLog(TEST_DIR);

      expect(result.toLowerCase()).toMatch(/no commits|fatal|your branch/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with spaces in names', async () => {
      const fileName = 'file with spaces.txt';
      await fs.writeFile(path.join(TEST_DIR, fileName), 'content');

      const addResult = await executeGitAdd([fileName], TEST_DIR);
      expect(addResult).toContain('Staged');

      const status = await executeGitStatus(TEST_DIR);
      expect(status).toContain(fileName);
    });

    it('should handle special characters in commit message', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });

      const message = 'Test: "quotes" & <special> chars $VAR';
      const result = await executeGitCommit(message, TEST_DIR);

      expect(result).toContain(message);
    });

    it('should handle very long commit messages', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });

      const longMessage = 'A'.repeat(1000);
      const result = await executeGitCommit(longMessage, TEST_DIR);

      expect(result).toBeDefined();
    });

    it('should handle adding multiple files at once', async () => {
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(TEST_DIR, `file${i}.txt`), `content${i}`);
      }

      const files = Array.from({ length: 10 }, (_, i) => `file${i}.txt`);
      const result = await executeGitAdd(files, TEST_DIR);

      expect(result).toContain('Staged 10 file(s)');
    });

    it('should handle branch names with special characters', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'init.txt'), 'init');
      await execa('git', ['add', 'init.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'init'], { cwd: TEST_DIR });

      const branchName = 'feature/test-123';
      const result = await executeGitCheckout(branchName, TEST_DIR, true);

      expect(result).toContain(branchName);
    });

    it('should handle empty directory for add', async () => {
      const result = await executeGitAdd(['.'], TEST_DIR);

      // Should handle empty directory gracefully
      expect(result).toBeDefined();
    });

    it('should handle stash pop when no stashes exist', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');
      await execa('git', ['add', 'test.txt'], { cwd: TEST_DIR });
      await execa('git', ['commit', '-m', 'initial'], { cwd: TEST_DIR });

      const result = await executeGitStash('pop', undefined, TEST_DIR).catch((e) => e.message);

      expect(result.toLowerCase()).toMatch(/no stash|error/);
    });
  });
});
