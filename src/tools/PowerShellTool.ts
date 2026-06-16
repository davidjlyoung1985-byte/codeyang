/**
 * PowerShellTool — Windows PowerShell execution with security validation.
 * Mirrors BashTool but uses powershell.exe directly with Windows-specific safeguards.
 */
import { execa } from 'execa';
import { checkPermission } from '../permission/index.js';

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

  // Security: always check dangerous patterns
  // (these are hard safety boundaries that cannot be bypassed)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(
        `[SAFETY] PowerShell command flagged by dangerous pattern check (cannot be overridden): "${command.slice(0, 150)}".`,
      );
    }
  }

  // Check permission system for all commands
  const segments = command.split(/[\s;|&]+/).filter(Boolean);
  for (const segment of segments) {
    const firstWord = segment.split(' ')[0];
    const perm = await checkPermission('bash', firstWord);
    if (perm.level === 'deny') {
      throw new Error(`[PERMISSION DENIED] ${perm.reason || 'Command not permitted.'}`);
    }
    if (perm.level === 'ask') {
      throw new Error(
        `[PERMISSION REQUIRED] ${perm.reason || 'This operation needs confirmation.'} User must approve this action first.`,
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
