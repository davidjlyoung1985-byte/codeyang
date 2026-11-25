import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execa } from 'execa';

vi.mock('execa');
vi.mock('./shared.js', () => ({
  resolveSafePath: vi.fn(async (path: string) => {
    if (path.includes('forbidden')) return null;
    return path;
  }),
}));

import { executeLaunchApp } from './LaunchAppTool.js';

/**
 * An application present in BOTH the Windows and the Unix whitelist.
 *
 * `notepad` and `calc` only exist in ALLOWED_APPS_WINDOWS, so using them made
 * this suite fail on Linux and macOS with "Application not in whitelist" —
 * the tests were only ever run on Windows. `code` is in both sets.
 */
const CROSS_PLATFORM_APP = 'code';

describe('LaunchAppTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should launch whitelisted application', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp(CROSS_PLATFORM_APP);

      expect(result).toContain(`Launched: ${CROSS_PLATFORM_APP}`);
      expect(execa).toHaveBeenCalled();
    });

    it('should launch URL', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('https://example.com');

      expect(result).toContain('Launched: https://example.com');
    });

    it('should launch application with arguments', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp(CROSS_PLATFORM_APP, 'file.txt');

      expect(result).toContain('Launched');
    });
  });

  describe('security validation', () => {
    it('should reject empty target', async () => {
      const result = await executeLaunchApp('');

      expect(result).toContain('Error: target cannot be empty');
    });

    // Shell metacharacters are no longer rejected at input: they are *inert*
    // because the value travels through the environment block (Windows) or an
    // argv array (open / xdg-open). What matters is that they never reach a
    // command string — see the regression tests below.
    it('should reject targets containing control characters', async () => {
      const targets = ['app\nrm -rf /', 'app\rcalc', 'app\0calc'];

      for (const target of targets) {
        const result = await executeLaunchApp(target);
        expect(result).toContain('Error: target contains a control character');
      }
    });

    it('should reject arguments containing control characters', async () => {
      // NUL survives whitespace splitting and cannot be carried in the
      // environment block, so it must be refused. (A newline is just another
      // whitespace separator here and every resulting token is still checked.)
      const result = await executeLaunchApp(CROSS_PLATFORM_APP, 'file.txt\0rm -rf /');

      expect(result).toContain('Error: argument contains a control character');
    });

    it('should reject non-whitelisted applications', async () => {
      const result = await executeLaunchApp('malicious-app');

      expect(result).toContain('Error: Application not in whitelist');
    });

    it('should reject paths outside the sandbox', async () => {
      // resolveSafePath (mocked) refuses anything containing "forbidden"
      const result = await executeLaunchApp('C:\\forbidden\\file.txt');

      expect(result).toContain('Error: Path outside sandbox or not accessible');
    });
  });

  describe('Windows command-injection regression', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true, configurable: true });
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true, configurable: true });
    });

    it('must not interpolate the target into the PowerShell command text', async () => {
      // `"` and `(` were both missing from the old blocklist, and the value was
      // spliced into `Start-Process "…"` — a closing quote ended the string.
      const payload = 'http://example.com"(Start-Process calc)"';

      const result = await executeLaunchApp(payload);

      expect(result).toContain('Launched');

      const call = vi.mocked(execa).mock.calls[0];
      expect(call).toBeDefined();
      const [cmd, cmdArgs, opts] = call as [string, string[], { env: Record<string, string> }];

      expect(cmd).toBe('powershell');
      const commandText = cmdArgs.join(' ');
      expect(commandText).not.toContain(payload);
      expect(commandText).not.toContain('Start-Process calc');
      expect(commandText).toContain('$env:CODEYANG_LAUNCH_TARGET');

      // The untrusted value is transported as data, not code.
      expect(opts.env['CODEYANG_LAUNCH_TARGET']).toBe(payload);
    });

    it('must transport extra arguments via the environment, not the command text', async () => {
      await executeLaunchApp('code', 'file1.txt file2.txt');

      const call = vi.mocked(execa).mock.calls[0];
      const [, cmdArgs, opts] = call as [string, string[], { env: Record<string, string> }];

      expect(cmdArgs.join(' ')).not.toContain('file1.txt');
      expect(JSON.parse(opts.env['CODEYANG_LAUNCH_ARGS']!)).toEqual(['file1.txt', 'file2.txt']);
    });

    it('should still open URLs that contain a query string', async () => {
      // `&` used to trip the metacharacter blocklist, so no URL with a query
      // string could ever be opened.
      const result = await executeLaunchApp('https://example.com?param=value&other=123');

      expect(result).toContain('Launched');
    });
  });

  describe('platform-specific behavior', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
      });
    });

    it('should use PowerShell on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      await executeLaunchApp('notepad');

      expect(execa).toHaveBeenCalledWith('powershell', expect.arrayContaining(['-Command']), expect.any(Object));
    });

    it('should use open on macOS', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('https://example.com');

      expect(result).toContain('Launched');
    });

    it('should use xdg-open on Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('https://example.com');

      expect(result).toContain('Launched');
    });
  });

  describe('error handling', () => {
    it('should handle application not found', async () => {
      vi.mocked(execa).mockRejectedValue({
        code: 1,
        stderr: 'Application not found',
        stdout: '',
      });

      const result = await executeLaunchApp(CROSS_PLATFORM_APP);

      expect(result).toContain('Launch completed');
      expect(result).toContain('Application not found');
    });

    it('should handle execution timeout', async () => {
      vi.mocked(execa).mockRejectedValue({
        message: 'Timed out',
        code: 1,
      });

      const result = await executeLaunchApp(CROSS_PLATFORM_APP);

      expect(result).toContain('Timed out');
    });

    it('should handle permission denied', async () => {
      vi.mocked(execa).mockRejectedValue({
        code: 126,
        stderr: 'Permission denied',
        stdout: '',
      });

      const result = await executeLaunchApp(CROSS_PLATFORM_APP);

      expect(result).toContain('Permission denied');
    });

    it('should handle non-zero exit code', async () => {
      vi.mocked(execa).mockRejectedValue({
        code: 1,
        stderr: 'Failed to launch',
        stdout: '',
      });

      const result = await executeLaunchApp(CROSS_PLATFORM_APP);

      expect(result).toContain('Launch completed');
    });
  });

  describe('URL validation', () => {
    it('should accept http URLs', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('http://example.com');

      expect(result).toContain('Launched');
    });

    it('should accept https URLs', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('https://example.com');

      expect(result).toContain('Launched');
    });

    it('should handle URLs with query parameters', async () => {
      // `&` used to be blocklisted, so query strings were unopenable.
      const result = await executeLaunchApp('https://example.com?param=value&other=123');

      expect(result).toContain('Launched');
    });

    it('should handle URLs with fragments', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('https://example.com#section');

      expect(result).toContain('Launched');
    });
  });

  describe('file path handling', () => {
    it('should accept Windows paths that are inside the sandbox', async () => {
      // Backslashes used to be blocklisted, so no file could be opened on
      // Windows at all — the resolveSafePath branch below was unreachable.
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('C:\\Users\\test\\file.txt');

      expect(result).toContain('Launched');
    });

    it('should accept .lnk shortcuts inside the sandbox', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('C:\\Users\\test\\shortcut.lnk');

      expect(result).toContain('Launched');
    });

    it('should reject sandboxed-out paths even when they are valid Windows paths', async () => {
      const result = await executeLaunchApp('C:\\forbidden\\malicious.exe');

      expect(result).toContain('Error: Path outside sandbox or not accessible');
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace in target', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('  notepad  ');

      expect(result).toBeDefined();
    });

    it('should handle multiple arguments', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('code', 'file1.txt file2.txt --new-window');

      expect(result).toContain('Launched');
    });

    it('should handle case-insensitive app names on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('NOTEPAD');

      expect(result).toContain('Launched');
    });

    it('should include stdout in success message if present', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: 'Application started successfully',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('notepad');

      expect(result).toContain('Application started successfully');
    });

    it('should handle concurrent launches', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const promises = [executeLaunchApp('notepad'), executeLaunchApp('calc'), executeLaunchApp('https://example.com')];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.includes('Launched'))).toBe(true);
    });

    it('should trim output in error messages', async () => {
      vi.mocked(execa).mockRejectedValue({
        code: 1,
        stderr: '  Error message with spaces  \n\n',
        stdout: '',
      });

      const result = await executeLaunchApp('notepad');

      expect(result).not.toMatch(/\n\n$/);
    });

    it('should handle empty arguments string', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('notepad', '');

      expect(result).toContain('Launched');
    });

    it('should filter empty arguments', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      await executeLaunchApp('notepad', 'file.txt   extra.txt');

      // Should split by whitespace and filter empty strings
      expect(execa).toHaveBeenCalled();
    });
  });

  describe('whitelist verification', () => {
    it('should allow all whitelisted Windows apps', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

      const windowsApps = ['notepad', 'calc', 'explorer', 'code', 'chrome'];

      for (const app of windowsApps) {
        const result = await executeLaunchApp(app);
        expect(result).toContain('Launched');
      }
    });

    it('should show partial whitelist in error message', async () => {
      const result = await executeLaunchApp('unknown-app');

      expect(result).toContain('Allowed:');
      expect(result).toMatch(/notepad|calc|code/);
    });
  });
});
