import { describe, test, expect } from 'vitest';
import { platform } from 'node:os';

const isMacOS = platform() === 'darwin';

describe.skipIf(!isMacOS)('macOS Network Isolation', () => {
  let osIsolationMacOS: typeof import('./os-isolation-macos.js');

  beforeEach(async () => {
    osIsolationMacOS = await import('./os-isolation-macos.js');
  });

  describe('detectMacOSSandbox', () => {
    test('should detect sandbox-exec availability', () => {
      const result = osIsolationMacOS.detectMacOSSandbox();
      expect(result).toBeDefined();
      expect(typeof result.supported).toBe('boolean');
    });
  });

  describe('generateSandboxProfile', () => {
    test('should generate profile with network denied by default', () => {
      const profile = osIsolationMacOS.generateSandboxProfile();
      expect(profile).toContain('(version 1)');
      expect(profile).toContain('(deny network*)');
    });

    test('should allow network when specified', () => {
      const profile = osIsolationMacOS.generateSandboxProfile(true);
      expect(profile).toContain('(allow network*)');
    });
  });

  describe('wrapCommandWithSandbox', () => {
    test('should return original command when network not blocked', () => {
      const result = osIsolationMacOS.wrapCommandWithSandbox('echo', ['test'], false);
      expect(result.command).toBe('echo');
      expect(result.args).toEqual(['test']);
    });

    test('should wrap command with sandbox-exec when blocking', () => {
      const result = osIsolationMacOS.wrapCommandWithSandbox('echo', ['test'], true);
      expect(result.command).toBe('sandbox-exec');
      expect(result.args).toContain('echo');
      expect(result.args).toContain('test');
      expect(result.profilePath).toBeDefined();
    });
  });

  describe('getMacOSSandboxStatus', () => {
    test('should return status string', () => {
      const status = osIsolationMacOS.getMacOSSandboxStatus();
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);
    });
  });
});

describe.skipIf(isMacOS)('macOS Network Isolation (Non-macOS)', () => {
  test('should return not supported on non-macOS platforms', async () => {
    const { detectMacOSSandbox } = await import('./os-isolation-macos.js');
    const result = detectMacOSSandbox();
    expect(result.supported).toBe(false);
    expect(result.error).toContain('Not macOS');
  });
});
