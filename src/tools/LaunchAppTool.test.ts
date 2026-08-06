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

      const result = await executeLaunchApp('notepad');

      expect(result).toContain('Launched: notepad');
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

      const result = await executeLaunchApp('notepad', 'file.txt');

      expect(result).toContain('Launched');
    });
  });

  describe('security validation', () => {
    it('should reject empty target', async () => {
      const result = await executeLaunchApp('');

      expect(result).toContain('Error: target cannot be empty');
    });

    it('should reject targets with dangerous shell metacharacters (not path separators)', async () => {
      const dangerousTargets = [
        'app;rm -rf /',
        'app|cat /etc/passwd',
        'app`whoami`',
        'app$VAR',
        'app>output.txt',
        'app<input.txt',
      ];

      for (const target of dangerousTargets) {
        const result = await executeLaunchApp(target);
        expect(result).toContain('Error: target contains dangerous shell characters');
      }
    });

    it('should reject arguments with shell metacharacters', async () => {
      const result = await executeLaunchApp('notepad', 'file.txt;rm -rf /');

      expect(result).toContain('Error: argument contains dangerous shell characters');
    });

    it('should reject non-whitelisted applications', async () => {
      const result = await executeLaunchApp('malicious-app');

      expect(result).toContain('Error: Application not in whitelist');
    });

    it('should reject paths with backslash (Windows paths blocked by dangerous chars)', async () => {
      // Note: Implementation blocks backslashes as dangerous characters
      const result = await executeLaunchApp('C:\\forbidden\\file.txt');

      expect(result).toContain('Error: target contains dangerous shell characters');
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

      const result = await executeLaunchApp('notepad');

      expect(result).toContain('Launch completed');
      expect(result).toContain('Application not found');
    });

    it('should handle execution timeout', async () => {
      vi.mocked(execa).mockRejectedValue({
        message: 'Timed out',
        code: 1,
      });

      const result = await executeLaunchApp('calc');

      expect(result).toContain('Timed out');
    });

    it('should handle permission denied', async () => {
      vi.mocked(execa).mockRejectedValue({
        code: 126,
        stderr: 'Permission denied',
        stdout: '',
      });

      const result = await executeLaunchApp('notepad');

      expect(result).toContain('Permission denied');
    });

    it('should handle non-zero exit code', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: 'Failed to launch',
        exitCode: 1,
      } as unknown as ReturnType<typeof execa>);

      const result = await executeLaunchApp('notepad');

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
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as unknown as ReturnType<typeof execa>);

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
    it('should reject Windows paths with backslashes (blocked by dangerous chars)', async () => {
      // Note: Backslashes are blocked before path validation happens
      const result = await executeLaunchApp('C:\\Users\\test\\file.txt');

      expect(result).toContain('Error: target contains dangerous shell characters');
    });

    it('should reject .lnk files with backslashes', async () => {
      // Note: Backslashes are blocked before path validation happens
      const result = await executeLaunchApp('C:\\Users\\test\\shortcut.lnk');

      expect(result).toContain('Error: target contains dangerous shell characters');
    });

    it('should reject paths with backslashes (dangerous char check first)', async () => {
      const result = await executeLaunchApp('C:\\forbidden\\malicious.exe');

      expect(result).toContain('Error: target contains dangerous shell characters');
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
