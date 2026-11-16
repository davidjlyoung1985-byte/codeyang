import { describe, it, expect, beforeEach, vi } from 'vitest';

// Permission checks must be observable without shelling out to powershell.exe.
vi.mock('../permission/index.js', () => ({
  checkPermission: vi.fn(),
}));

import { checkPermission } from '../permission/index.js';
import { executePowerShell } from './PowerShellTool.js';

describe('PowerShellTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPermission).mockResolvedValue({ level: 'allow' });
  });

  // ── Regression: the permission subject must be the whole command ──
  //
  // This file used to split the command on whitespace and pass only the first
  // word to checkPermission(), so every rule written against a whole command
  // (`rm -rf*`, `git push --force*`, `sudo*`) was unreachable.
  describe('regression: full command reaches the permission rules', () => {
    it('checks the whole command, not just its first word', async () => {
      await executePowerShell('Write-Output hello').catch(() => undefined);
      const subjects = vi.mocked(checkPermission).mock.calls.map((c) => c[1]);
      expect(subjects).toContain('Write-Output hello');
    });

    it('blocks when a rule matches the full command', async () => {
      vi.mocked(checkPermission).mockImplementation(async (_cat, subject) =>
        subject.startsWith('Get-Thing && Stop-Service') ? { level: 'deny', reason: 'blocked' } : { level: 'allow' },
      );
      await expect(executePowerShell('Get-Thing && Stop-Service -Name Spooler')).rejects.toThrow(/PERMISSION DENIED/);
    });

    it('checks every segment of a compound command', async () => {
      await executePowerShell('echo a; echo b').catch(() => undefined);
      const subjects = vi.mocked(checkPermission).mock.calls.map((c) => c[1]);
      expect(subjects).toContain('echo a');
      expect(subjects).toContain('echo b');
    });
  });

  // ── Hard safety boundary: cannot be overridden by permission rules ──
  describe('dangerous pattern blocklist', () => {
    it.each([
      'Remove-Item -Recurse C:\\temp',
      'Remove-Item -Force C:\\temp',
      'Format-Volume -DriveLetter D',
      'Clear-Disk -Number 1',
      'git push --force origin main',
    ])('rejects %s before consulting permissions', async (cmd) => {
      await expect(executePowerShell(cmd)).rejects.toThrow(/SAFETY/);
      // The hard block must fire first — no permission lookup at all.
      expect(checkPermission).not.toHaveBeenCalled();
    });
  });

  it('rejects an empty command without executing anything', async () => {
    await expect(executePowerShell('')).rejects.toThrow();
  });
});
