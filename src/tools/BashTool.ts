import { execa } from 'execa';

// Dangerous command patterns that require user confirmation
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,           // rm -rf (recursive force delete)
  /\brm\s+-r\s+\//,          // rm -r /
  /\brm\s+-rf\s+\//,         // rm -rf /
  /\brmdir\s+\/s\b/i,        // Windows rmdir /s
  /\bformat\s+/i,            // Windows format
  /\bdestroy\b/i,            // destroy operations
  /\bdd\s+if=/i,             // dd with input (disk operations)
  /\b>:?\s*\/dev\//,         // redirect to /dev/ (disk write)
  /\bmkfs\b/i,               // make filesystem
  /\bfdisk\b/i,              // partition tool
  /\bgit\s+push\s+--force\b/i,  // force push
  /\bgit\s+push\s+-f\b/i,       // force push (short)
  /\bcurl\s+.*\|\s*(bash|sh|zsh|powershell)\b/i,  // curl | sh
  /\bwget\s+.*\|\s*(bash|sh|zsh|powershell)\b/i,  // wget | sh
  /\bsudo\s+/i,              // sudo
  /\bchmod\s+-R\s+777\b/i,   // dangerous chmod
  /\bchown\s+-R\b/i,         // recursive chown
];

// User-customizable deny list from env var (comma-separated substrings)
const DENY_LIST = (process.env['CODEYANG_DENY_COMMANDS'] || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function executeBash(command: string, cwd?: string, timeoutSecs = 30): Promise<string> {
  // Check deny list (exact substring match)
  for (const denied of DENY_LIST) {
    if (command.includes(denied)) {
      return `[SAFETY] Command blocked by deny list: "${denied}" appears in the command. Ask the user if they want to allow it.`;
    }
  }

  // Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `[SAFETY] Command flagged as dangerous: "${command.slice(0, 150)}". Use the Question tool to ask the user if they want to proceed.`;
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
