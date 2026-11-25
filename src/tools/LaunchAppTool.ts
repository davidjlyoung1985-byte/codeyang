/**
 * LaunchAppTool — open local applications, files, and URLs using the OS launcher.
 *
 * Platform support:
 * - Windows: PowerShell `Start-Process`
 * - macOS: `open`
 * - Linux: `xdg-open`
 *
 * ── SECURITY ──
 * The old implementation interpolated `target` straight into a PowerShell
 * command string:
 *
 *     exec('powershell', '-Command', `Start-Process "${target}"`)
 *
 * and relied on a character blocklist (`/[;&|`$<>{}[\]\\!]/`) to make that
 * safe. The blocklist missed `"`, `'`, `(`, `)`, newline and CR, so a target
 * such as
 *
 *     http://x"`nStart-Process calc`n"
 *
 * passed the URL regex, passed the blocklist, and PowerShell split it into two
 * statements. Blocklists over a shell grammar do not work; the fix is to stop
 * building a command string at all.
 *
 * Values now reach PowerShell through the **environment block**, which
 * CreateProcess passes as opaque data — nothing in it is ever parsed as code.
 * The script itself is a constant. `open` / `xdg-open` were already called with
 * argv arrays via execa, which is equally safe.
 *
 * Because argv/env transport makes shell metacharacters inert, the old
 * blocklist is gone. It was also causing two real bugs: `C:\...` paths were
 * rejected before the sandbox check could see them (so no file could be opened
 * on Windows at all), and any URL with a query string was rejected because of
 * `&`.
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

/**
 * Control characters are rejected outright: they cannot survive the environment
 * block, and a newline in a launch target has no legitimate meaning.
 */
const CONTROL_CHARS = /[\0\n\r]/;

/** Env var names the launch script reads. Prefixed to avoid collisions. */
const ENV_TARGET = 'CODEYANG_LAUNCH_TARGET';
const ENV_ARGS = 'CODEYANG_LAUNCH_ARGS';

/**
 * Constant PowerShell script. User data never appears in this string — it is
 * read from `$env:CODEYANG_LAUNCH_*`, so quoting/injection cannot apply.
 */
const PS_LAUNCH_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$target = $env:' + ENV_TARGET,
  '$rawArgs = $env:' + ENV_ARGS,
  'if ([string]::IsNullOrEmpty($rawArgs)) {',
  '  Start-Process -FilePath $target',
  '} else {',
  '  $parsed = ConvertFrom-Json $rawArgs',
  '  Start-Process -FilePath $target -ArgumentList @($parsed)',
  '}',
].join('; ');

function detectPlatform(): 'win' | 'mac' | 'linux' {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

interface ExecOptions {
  env?: Record<string, string | undefined>;
}

async function exec(
  args: string[],
  options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const [cmd, ...cmdArgs] = args;
  try {
    // Always pass the third argument so the shape of the call stays uniform.
    const result = await execa(cmd!, cmdArgs, { timeout: 15000, ...options });
    return { stdout: result.stdout || '', stderr: result.stderr || '', code: 0 };
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string; message?: string };
    return { stdout: e.stdout || '', stderr: e.stderr || e.message || '', code: e.code ?? 1 };
  }
}

export async function executeLaunchApp(target: string, args?: string): Promise<string> {
  if (!target.trim()) return 'Error: target cannot be empty';

  // Control characters only. Shell metacharacters are inert: on Windows the
  // value travels through the environment block, elsewhere through argv.
  if (CONTROL_CHARS.test(target)) {
    return 'Error: target contains a control character (NUL/CR/LF)';
  }

  const platform = detectPlatform();
  const extraArgs = args ? args.split(/\s+/).filter(Boolean) : [];

  for (const arg of extraArgs) {
    if (CONTROL_CHARS.test(arg)) {
      return 'Error: argument contains a control character (NUL/CR/LF)';
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
      // SECURITY: user data goes through the environment, not the command text.
      result = await exec(['powershell', '-NoProfile', '-NonInteractive', '-Command', PS_LAUNCH_SCRIPT], {
        env: {
          ...process.env,
          [ENV_TARGET]: target,
          [ENV_ARGS]: extraArgs.length > 0 ? JSON.stringify(extraArgs) : '',
        },
      });
      break;
    }
    case 'mac': {
      // SECURITY: macOS uses 'open' with argv (no shell involved)
      result = await exec(['open', target, ...extraArgs]);
      break;
    }
    case 'linux': {
      // SECURITY: Linux uses 'xdg-open' with argv (no shell involved)
      result = await exec(['xdg-open', target, ...extraArgs]);
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
