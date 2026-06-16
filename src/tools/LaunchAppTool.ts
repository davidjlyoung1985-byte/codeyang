/**
 * LaunchAppTool — open local applications, files, and URLs using the OS launcher.
 *
 * Platform support:
 * - Windows: uses Start-Process / start
 * - macOS: uses open
 * - Linux: uses xdg-open
 *
 * SECURITY:
 * - Application whitelist for executable names
 * - Sandbox path validation for file paths
 * - URL validation for web links
 */
import { execa } from 'execa';
import { resolveSafePath } from './shared.js';

// SECURITY: Whitelist of allowed applications (Windows names)
const ALLOWED_APPS_WINDOWS = new Set([
  'notepad',
  'notepad.exe',
  'calc',
  'calc.exe',
  'mspaint',
  'mspaint.exe',
  'explorer',
  'explorer.exe',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'code',
  'code.exe', // VS Code
  'chrome',
  'chrome.exe',
  'firefox',
  'firefox.exe',
  'msedge',
  'msedge.exe',
]);

// SECURITY: Whitelist of allowed applications (macOS/Linux)
const ALLOWED_APPS_UNIX = new Set([
  'TextEdit',
  'Calculator',
  'Terminal',
  'code',
  'Code', // VS Code
  'chrome',
  'Chrome',
  'Google Chrome',
  'firefox',
  'Firefox',
  'safari',
  'Safari',
]);

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

  // Validate target — prevent shell metacharacters and dangerous patterns
  const DANGEROUS_CHARS = /[;&|`$<>{}[\]\\!]/;
  if (DANGEROUS_CHARS.test(target)) {
    return `Error: target contains dangerous shell characters: ${target}`;
  }

  const platform = detectPlatform();
  const extraArgs = args ? args.split(/\s+/).filter(Boolean) : [];

  // Validate extraArgs — each arg must not contain shell metacharacters
  for (const arg of extraArgs) {
    if (DANGEROUS_CHARS.test(arg)) {
      return `Error: argument contains dangerous shell characters: ${arg}`;
    }
  }

  // Check if it's a URL
  const isUrl = /^https?:\/\//i.test(target);

  // SECURITY: If it's a file path, validate against sandbox
  if (!isUrl && (target.includes('\\') || target.includes('/') || target.endsWith('.lnk'))) {
    const safePath = await resolveSafePath(target);
    if (!safePath) {
      return `Error: Path outside sandbox or not accessible: ${target}`;
    }
    target = safePath;
  }

  // SECURITY: If it's an app name, check whitelist
  if (!isUrl && !target.includes('\\') && !target.includes('/')) {
    const appWhitelist = platform === 'win' ? ALLOWED_APPS_WINDOWS : ALLOWED_APPS_UNIX;
    const appNameLower = target.toLowerCase();

    if (!appWhitelist.has(appNameLower) && !appWhitelist.has(target)) {
      return `Error: Application not in whitelist: ${target}. Allowed: ${Array.from(appWhitelist).slice(0, 10).join(', ')}...`;
    }
  }

  let result: { stdout: string; stderr: string; code: number };

  switch (platform) {
    case 'win': {
      // SECURITY: Use PowerShell Start-Process instead of cmd /c start
      if (isUrl) {
        result = await exec('powershell', '-Command', `Start-Process "${target}"`);
      } else if (target.includes('\\') || target.includes('/')) {
        // File path — already validated by resolveSafePath
        result = await exec('powershell', '-Command', `Start-Process "${target}"`);
      } else {
        // App name — already validated by whitelist
        if (extraArgs.length > 0) {
          result = await exec(
            'powershell',
            '-Command',
            `Start-Process "${target}" -ArgumentList "${extraArgs.join('","')}"`,
          );
        } else {
          result = await exec('powershell', '-Command', `Start-Process "${target}"`);
        }
      }
      break;
    }
    case 'mac': {
      // SECURITY: macOS uses 'open' command with validated paths
      if (isUrl || extraArgs.length > 0) {
        result = await exec('open', target, ...extraArgs);
      } else {
        result = await exec('open', target);
      }
      break;
    }
    case 'linux': {
      // SECURITY: Linux uses 'xdg-open' with validated paths
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
