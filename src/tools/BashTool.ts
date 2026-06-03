import { execa } from 'execa';

export async function executeBash(command: string, cwd?: string, timeoutSecs = 30): Promise<string> {
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
