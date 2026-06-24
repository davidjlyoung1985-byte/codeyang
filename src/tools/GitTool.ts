import { execa } from 'execa';
import * as path from 'node:path';
import { auditLog } from '../utils/sessionStore.js';

/**
 * Execute a git command
 */
async function executeGitCommand(
  args: string[],
  cwd?: string,
  timeoutSecs = 30,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // 忽略管道输出中的分页器配置，避免 git 卡住
  const env = { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat' };
  try {
    const workDir = cwd ? path.resolve(cwd) : process.cwd();
    const result = await execa('git', args, {
      cwd: workDir,
      timeout: timeoutSecs * 1000,
      reject: false,
      env,
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
 * 检查当前目录是否是 git 仓库
 */
async function ensureGitRepo(cwd?: string): Promise<string | null> {
  const dir = cwd || process.cwd();
  try {
    const { exitCode } = await execa('git', ['rev-parse', '--git-dir'], {
      cwd: dir,
      timeout: 5000,
      reject: false,
    });
    if (exitCode !== 0) {
      return `Not a git repository (or any of the parent directories): ${dir}`;
    }
  } catch {
    return `Git command not available`;
  }
  return null;
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
  // Validate message doesn't contain git flags disguised as commit message
  // (defense in depth — execa array args already prevent injection, but this
  // catches attempts to trick the LLM into passing "--no-verify" as message)
  if (message.startsWith('-')) {
    return `Error: Commit message cannot start with '-' (looks like a git flag). Please provide a proper commit message.`;
  }

  if (!message.trim()) {
    return 'Error: Commit message cannot be empty.';
  }

  const notRepo = await ensureGitRepo(cwd);
  if (notRepo) return `Error: ${notRepo}`;

  // Check for changes
  const statusCheck = await executeGitCommand(['status', '--porcelain'], cwd);
  if (!statusCheck.stdout.trim()) {
    return 'Nothing to commit — working tree clean. Make changes first.';
  }

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
 * Validate a git repository URL — only allow trusted hosts and secure protocols
 *
 * SECURITY: Whitelist trusted Git hosting providers to prevent supply chain attacks
 */
function validateGitUrl(url: string): string | null {
  // Trusted Git hosting providers
  const TRUSTED_HOSTS = new Set([
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'gitee.com',
    // Add your enterprise Git servers here via environment variable
    ...(process.env['CODEYANG_TRUSTED_GIT_HOSTS'] || '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
  ]);

  let hostname = '';

  // Parse git@ style (SSH deploy keys): git@github.com:user/repo.git
  const sshMatch = url.match(/^([^@]+)@([^:]+):(.+)$/);
  if (sshMatch) {
    hostname = sshMatch[2];
  } else if (url.startsWith('https://') || url.startsWith('ssh://')) {
    // Parse https:// and ssh:// URLs
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
    } catch {
      return 'Invalid git URL format';
    }
  } else {
    return 'Invalid git URL scheme. Only ssh://, https://, or git@host:path are allowed';
  }

  // Validate hostname against whitelist
  if (!TRUSTED_HOSTS.has(hostname)) {
    return (
      `Untrusted git host: ${hostname}. Only ${Array.from(TRUSTED_HOSTS).join(', ')} are allowed. ` +
      `To add custom hosts, set CODEYANG_TRUSTED_GIT_HOSTS environment variable.`
    );
  }

  return null;
}

/**
 * Sanitize a branch name — reject anything that could be interpreted as a git flag or contain path traversal
 */
function sanitizeBranchName(name: string): string | null {
  if (name.startsWith('-')) return 'Branch name cannot start with -';
  if (name.includes('..')) return 'Branch name cannot contain ..';
  if (name.includes('/--')) return 'Branch name cannot contain --';
  return null;
}

/**
 * Create or switch to a branch
 */
export async function executeGitCheckout(branch: string, cwd?: string, create = false): Promise<string> {
  const sanitized = sanitizeBranchName(branch);
  if (sanitized !== null) return `Error: ${sanitized}`;

  const args = create ? ['checkout', '-b', branch] : ['checkout', branch, '--'];

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
  const notRepo = await ensureGitRepo(cwd);
  if (notRepo) return `Error: ${notRepo}`;

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

  if (force) {
    void auditLog({
      action: 'git_push_force',
      command: `git push --force ${remote} ${branch || ''}`,
      cwd: cwd || process.cwd(),
      result: result.stdout?.slice(0, 200) || 'success',
      details: `Force push to ${remote}/${branch || 'current branch'}`,
    });
  }

  return result.stdout || result.stderr || 'Push completed';
}

/**
 * Pull from remote
 */
export async function executeGitPull(cwd?: string, remote = 'origin', branch?: string): Promise<string> {
  const notRepo = await ensureGitRepo(cwd);
  if (notRepo) return `Error: ${notRepo}`;

  const args = ['pull', remote];
  if (branch) args.push(branch);

  const result = await executeGitCommand(args, cwd, 60); // Longer timeout for pull

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || result.stderr || 'Pull completed';
}

/**
 * Clone a repository
 *
 * SECURITY: Disables Git hooks to prevent arbitrary code execution
 */
export async function executeGitClone(url: string, destination?: string, cwd?: string): Promise<string> {
  const urlErr = validateGitUrl(url);
  if (urlErr) return `Error: ${urlErr}`;

  // SECURITY: Disable Git hooks during clone to prevent code execution
  const args = ['clone', '--config', 'core.hooksPath=/dev/null', url];

  if (destination) {
    const destSanitized = sanitizeBranchName(destination);
    if (destSanitized) return `Error: ${destSanitized}`;
    args.push(destination);
  }

  const result = await executeGitCommand(args, cwd, 120); // Longer timeout for clone

  if (result.exitCode !== 0) {
    return `Error: ${result.stderr || result.stdout}`;
  }

  return result.stdout || result.stderr || 'Repository cloned successfully (Git hooks disabled for security)';
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

  // 审计日志：记录危险操作
  if (hard) {
    void auditLog({
      action: 'git_reset_hard',
      command: `git reset --hard ${(files || []).join(' ')}`,
      cwd: cwd || process.cwd(),
      result: result.stdout?.slice(0, 200) || 'success',
      details: `Hard reset dropped uncommitted changes${files && files.length > 0 ? ` for ${files.length} file(s)` : ''}`,
    });
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
  const notRepo = await ensureGitRepo(cwd);
  if (notRepo) return `Error: ${notRepo}`;

  const args = ['stash'];

  if (action === 'save') {
    // 检查是否有更改可 stash
    const statusCheck = await executeGitCommand(['status', '--porcelain'], cwd);
    if (!statusCheck.stdout.trim()) {
      return 'Nothing to stash — working tree clean.';
    }
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
  const notRepo = await ensureGitRepo(cwd);
  if (notRepo) return `Error: ${notRepo}`;

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
