import { execa } from 'execa';
import { checkPermission } from '../permission/index.js';

// User-customizable deny list from env var (comma-separated words)
const DENY_LIST = (process.env['CODEYANG_DENY_COMMANDS'] || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Check if a command matches any deny-listed word.
 * Uses word-boundary matching to reduce false positives.
 */
function isDenied(command: string): boolean {
  const tokens = command.split(/[\s;|&`$()<>{}\[\]"]+/);
  for (const token of tokens) {
    for (const denied of DENY_LIST) {
      if (token === denied || token.startsWith(denied + ' ')) return true;
    }
  }
  return false;
}

/**
 * Execute a shell command with permission checks.
 *
 * Prefix with "ALLOW: " to skip permission checks (for user-approved commands).
 */
export async function executeBash(command: string, cwd?: string, timeoutSecs = 30): Promise<string> {
  // Handle ALLOW prefix — user has explicitly approved this command
  if (command.startsWith('ALLOW: ')) {
    command = command.slice(7).trim();
    // Run without further permission checks
    const result = await execa(command, {
      shell: process.platform === 'win32' ? 'powershell.exe' : 'bash',
      cwd: cwd || process.cwd(),
      timeout: timeoutSecs * 1000,
      reject: false,
      env: { ...process.env, CI: undefined },
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

  // Check deny list
  if (isDenied(command)) {
    throw new Error(`[SAFETY] Command blocked by deny list. Use "ALLOW: <command>" to override (after user approval).`);
  }

  // Check permission system for each command segment (prevents chaining bypass)
  const segments = command.split(/[\s;|&]+/).filter(Boolean);
  for (const segment of segments) {
    const firstWord = segment.split(' ')[0];
    const perm = await checkPermission('bash', firstWord);
    if (perm.level === 'deny') {
      throw new Error(
        `[PERMISSION DENIED] ${perm.reason || 'This command is not permitted.'} Use "ALLOW: <command>" to override (after user approval).`,
      );
    }
    if (perm.level === 'ask') {
      throw new Error(
        `[PERMISSION REQUIRED] ${perm.reason || 'This operation needs confirmation.'} Ask the user for approval, then retry with "ALLOW: <command>".`,
      );
    }
  }

  const result = await execa(command, {
    shell: process.platform === 'win32' ? 'powershell.exe' : 'bash',
    cwd: cwd || process.cwd(),
    timeout: timeoutSecs * 1000,
    reject: false,
    env: { ...process.env, CI: undefined },
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
