import { execa } from 'execa';
import * as path from 'node:path';

/**
 * Execute a git command
 */
async function executeGitCommand(
  args: string[],
  cwd?: string,
  timeoutSecs = 30,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const workDir = cwd ? path.resolve(cwd) : process.cwd();
    const result = await execa('git', args, {
      cwd: workDir,
      timeout: timeoutSecs * 1000,
      reject: false,
    });

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      stdout: '',
      stderr: `Error executing git command: ${msg}`,
      exitCode: 1,
    };
  }
}

/**
 * Get git repository status
 */
export async function executeGitStatus(cwd?: string, short = false): Promise<string> {
  const args = short ? ['status', '-s'] : ['status'];
  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || 'Failed to get git status'}`;
  }

  return result.stdout || 'No changes (working tree clean)';
}

/**
 * Show git diff
 */
export async function executeGitDiff(cwd?: string, staged = false, filePath?: string): Promise<string> {
  const args = ['diff'];
  if (staged) {
    args.push('--cached');
  }
  if (filePath) {
    args.push('--', filePath);
  }

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || 'Failed to get git diff'}`;
  }

  return result.stdout || 'No differences';
}

/**
 * Create a git commit
 */
export async function executeGitCommit(message: string, cwd?: string, addAll = false): Promise<string> {
  // Stage files if requested
  if (addAll) {
    const addResult = await executeGitCommand(['add', '-A'], cwd);
    if (addResult.exitCode !== 0) {
      return `Error staging files: ${addResult.stderr}`;
    }
  }

  // Create commit
  const result = await executeGitCommand(['commit', '-m', message], cwd);

  if (result.exitCode !== 0) {
    return `Error creating commit: ${result.stderr || result.stdout}`;
  }

  return result.stdout || 'Commit created successfully';
}

/**
 * List git branches
 */
export async function executeGitBranch(cwd?: string, remotes = false): Promise<string> {
  const args = ['branch'];
  if (remotes) {
    args.push('-a'); // Show all branches including remotes
  }

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || 'Failed to list branches'}`;
  }

  return result.stdout || 'No branches found';
}

/**
 * Create or switch to a branch
 */
export async function executeGitCheckout(branch: string, cwd?: string, create = false): Promise<string> {
  const args = ['checkout'];
  if (create) {
    args.push('-b');
  }
  args.push(branch);

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || `Switched to branch '${branch}'`;
}

/**
 * Show git log
 */
export async function executeGitLog(cwd?: string, maxCount = 10, oneline = false): Promise<string> {
  const args = ['log', `--max-count=${maxCount}`];
  if (oneline) {
    args.push('--oneline');
  }

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || 'Failed to get git log'}`;
  }

  return result.stdout || 'No commits found';
}

/**
 * Push to remote
 */
export async function executeGitPush(cwd?: string, remote = 'origin', branch?: string, force = false): Promise<string> {
  const args = ['push'];
  if (force) {
    args.push('--force');
  }
  args.push(remote);
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(args, cwd, 60); // Longer timeout for push

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || result.stderr || 'Push completed';
}

/**
 * Pull from remote
 */
export async function executeGitPull(cwd?: string, remote = 'origin', branch?: string): Promise<string> {
  const args = ['pull'];
  args.push(remote);
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(args, cwd, 60); // Longer timeout for pull

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || result.stderr || 'Pull completed';
}

/**
 * Clone a repository
 */
export async function executeGitClone(url: string, destination?: string, cwd?: string): Promise<string> {
  const args = ['clone', url];
  if (destination) {
    args.push(destination);
  }

  const result = await executeGitCommand(args, cwd, 120); // Longer timeout for clone

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || result.stderr || 'Repository cloned successfully';
}

/**
 * Stage files
 */
export async function executeGitAdd(files: string[], cwd?: string): Promise<string> {
  if (files.length === 0) {
    return 'Error: No files specified';
  }

  const args = ['add', ...files];
  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return `Staged ${files.length} file(s)`;
}

/**
 * Unstage files
 */
export async function executeGitReset(files?: string[], cwd?: string, hard = false): Promise<string> {
  const args = ['reset'];
  if (hard) {
    args.push('--hard');
  }
  if (files && files.length > 0) {
    args.push('HEAD', '--', ...files);
  }

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || 'Reset completed';
}

/**
 * Stash changes
 */
export async function executeGitStash(
  action: 'save' | 'pop' | 'list' | 'apply' = 'save',
  message?: string,
  cwd?: string,
): Promise<string> {
  const args = ['stash'];

  if (action === 'save') {
    args.push('push');
    if (message) {
      args.push('-m', message);
    }
  } else {
    args.push(action);
  }

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || `Stash ${action} completed`;
}

/**
 * Merge branches
 */
export async function executeGitMerge(branch: string, cwd?: string, noFf = false): Promise<string> {
  const args = ['merge'];
  if (noFf) {
    args.push('--no-ff');
  }
  args.push(branch);

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || `Merged branch '${branch}'`;
}

/**
 * Show remote repositories
 */
export async function executeGitRemote(cwd?: string, verbose = false): Promise<string> {
  const args = ['remote'];
  if (verbose) {
    args.push('-v');
  }

  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || 'Failed to list remotes'}`;
  }

  return result.stdout || 'No remotes configured';
}

/**
 * Show current branch
 */
export async function executeGitCurrentBranch(cwd?: string): Promise<string> {
  const result = await executeGitCommand(['branch', '--show-current'], cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || 'Failed to get current branch'}`;
  }

  return result.stdout.trim() || 'Not on any branch (detached HEAD)';
}

/**
 * Show file blame/annotation
 */
export async function executeGitBlame(filePath: string, cwd?: string): Promise<string> {
  const args = ['blame', filePath];
  const result = await executeGitCommand(args, cwd);

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || 'No blame information available';
}
