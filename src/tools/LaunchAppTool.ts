/**
 * LaunchAppTool — open local applications, files, and URLs using the OS launcher.
 *
 * Platform support:
 * - Windows: uses Start-Process / start
 * - macOS: uses open
 * - Linux: uses xdg-open
 */
import { execa } from 'execa';

function detectPlatform(): 'win' | 'mac' | 'linux' {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

async function exec(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const [cmd, ...cmdArgs] = args;
  try {
    const result = await execa(cmd, cmdArgs, { timeout: 15000 });
    return { stdout: result.stdout || '', stderr: result.stderr || '', code: 0 };
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string; message?: string };
    return { stdout: e.stdout || '', stderr: e.stderr || e.message || '', code: e.code ?? 1 };
  }
}

export async function executeLaunchApp(target: string, args?: string): Promise<string> {
  if (!target.trim()) return 'Error: target cannot be empty';

  const platform = detectPlatform();
  const extraArgs = args ? args.split(/\s+/) : [];

  // Check if it's a URL
  const isUrl = /^https?:\/\//i.test(target);

  let result: { stdout: string; stderr: string; code: number };

  switch (platform) {
    case 'win': {
      if (isUrl) {
        result = await exec('cmd', '/c', 'start', '', target);
      } else if (target.endsWith('.lnk') || target.includes('\\') || target.includes('/')) {
        // File path — open with default app
        result = await exec('cmd', '/c', 'start', '', target);
      } else {
        // App name — use start with the app name
        result = await exec('cmd', '/c', 'start', '', target, ...extraArgs);
      }
      break;
    }
    case 'mac': {
      if (isUrl || extraArgs.length > 0) {
        result = await exec('open', target, ...extraArgs);
      } else {
        result = await exec('open', target);
      }
      break;
    }
    case 'linux': {
      result = await exec('xdg-open', target, ...extraArgs);
      break;
    }
    default: {
      return `Error: unsupported platform "${process.platform}"`;
    }
  }

  if (result.code === 0) {
    return `Launched: ${target}${result.stdout ? '\n' + result.stdout.trim() : ''}`;
  }
  return `Launch completed (exit ${result.code}): ${target}\n${result.stderr || result.stdout || ''}`.trim();
}
