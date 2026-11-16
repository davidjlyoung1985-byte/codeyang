/**
 * PowerShellTool — Windows PowerShell execution with security validation.
 * Mirrors BashTool but uses powershell.exe directly with Windows-specific safeguards.
 */
import { execa } from 'execa';
import { checkPermission } from '../permission/index.js';
import { requestConfirmation } from '../permission/confirmation.js';
import { extractCommandSubjects } from './commandSubjects.js';

// Dangerous PowerShell patterns
const DANGEROUS_PATTERNS: RegExp[] = [
  /\bRemove-Item\s+-Recurse\b/i,
  /\bRemove-Item\s+-Force\b/i,
  /\brm\s+-rf\b/i,
  /\brm\s+-r\b/i,
  /\bFormat-Volume\b/i,
  /\bClear-Disk\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+push\s+-f\b/i,
];

export async function executePowerShell(command: string, cwd?: string, timeoutSecs = 30): Promise<string> {
  // SECURITY: ALLOW prefix removed - same fix as BashTool
  // All commands must go through permission system

  // An empty command has nothing to run; spawning powershell.exe for it just
  // costs a process (and used to hang for the full timeout).
  if (!command.trim()) {
    throw new Error('[SAFETY] Empty PowerShell command.');
  }

  // Security: always check dangerous patterns
  // (these are hard safety boundaries that cannot be bypassed)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(
        `[SAFETY] PowerShell command flagged by dangerous pattern check (cannot be overridden): "${command.slice(0, 150)}".`,
      );
    }
  }

  // Check permission system for all commands.
  //
  // SECURITY: check each subject in full, not just its first word. Rules are
  // written against whole commands (`rm -rf*`, `git push --force*`), so passing
  // only `rm` or `git` would let every one of them through unconfirmed.
  const subjects = new Set<string>(extractCommandSubjects(command));
  const pendingAsks: { subject: string; reason?: string }[] = [];

  for (const subject of subjects) {
    const perm = await checkPermission('bash', subject);
    if (perm.level === 'deny') {
      throw new Error(`[PERMISSION DENIED] ${perm.reason || 'Command not permitted.'}`);
    }
    if (perm.level === 'ask') {
      pendingAsks.push({ subject, reason: perm.reason });
    }
  }

  // Same semantics as BashTool: `ask` prompts, and fails closed with no TTY.
  for (const pending of pendingAsks) {
    const decision = await requestConfirmation({
      subject: `powershell: ${pending.subject}`,
      reason: pending.reason,
    });
    if (decision === 'deny') {
      throw new Error(
        `[PERMISSION REQUIRED] ${pending.reason || 'This operation needs confirmation.'} The user did not approve it.`,
      );
    }
  }

  const result = await execa(command, {
    shell: 'powershell.exe',
    cwd: cwd || process.cwd(),
    timeout: timeoutSecs * 1000,
    reject: false,
  });

  const stdout = result.stdout?.trim() || '';
  const stderr = result.stderr?.trim() || '';

  if (result.exitCode === 0) {
    const output = stdout || '(no output)';
    return stderr ? `${output}\n\n(stderr):\n${stderr}` : output;
  }

  const parts: string[] = [];
  if (stdout) parts.push(`stdout:\n${stdout}`);
  if (stderr) parts.push(`stderr:\n${stderr}`);
  parts.push(`exit code: ${result.exitCode}`);
  return parts.join('\n\n');
}
