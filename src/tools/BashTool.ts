import { execa } from 'execa';
import { checkPermission } from '../permission/index.js';

// User-customizable deny list from env var (comma-separated substrings)
const DENY_LIST = (process.env['CODEYANG_DENY_COMMANDS'] || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function executeBash(command: string, cwd?: string, timeoutSecs = 30): Promise<string> {
  // Check deny list (exact substring match — fastest check)
  for (const denied of DENY_LIST) {
    if (command.includes(denied)) {
      return `[SAFETY] Command blocked by deny list: "${denied}". Ask the user if they want to allow it via Question tool, then retry with "ALLOW: <command>" prefix.`;
    }
  }

  // Check permission system (rule-based + configurable)
  const perm = await checkPermission('bash', command.split(' ')[0]);
  if (perm.level === 'deny') {
    return `[PERMISSION DENIED] ${perm.reason || 'This command is not permitted.'} Use the Question tool to ask the user if they want to override.`;
  }
  if (perm.level === 'ask') {
    return `[PERMISSION REQUIRED] ${perm.reason || 'This operation needs confirmation.'} Use the Question tool to ask the user to approve: "${command.slice(0, 200)}". If approved, re-run with "ALLOW: " prefix.`;
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
