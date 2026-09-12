import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { platform } from 'node:os';

// 只在Windows上运行这些测试
const isWindows = platform() === 'win32';

describe.skipIf(!isWindows)('Windows Network Isolation', () => {
  let osIsolationWindows: typeof import('./os-isolation-windows.js');

  beforeEach(async () => {
    osIsolationWindows = await import('./os-isolation-windows.js');
  });

  describe('detectWindowsFirewall', () => {
    test('should detect if running on Windows', () => {
      const result = osIsolationWindows.detectWindowsFirewall();
      expect(result).toBeDefined();
      expect(typeof result.supported).toBe('boolean');
    });

    test('should check admin privileges', () => {
      const result = osIsolationWindows.detectWindowsFirewall();
      if (result.supported) {
        expect(typeof result.requiresAdmin).toBe('boolean');
      }
    });
  });

  describe('listCodeYangRules', () => {
    test('should return an array', () => {
      const rules = osIsolationWindows.listCodeYangRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    test('should only list CodeYang rules', () => {
      const rules = osIsolationWindows.listCodeYangRules();
      rules.forEach((rule) => {
        expect(rule).toMatch(/^CodeYang_Sandbox_/);
      });
    });
  });

  describe('cleanupAllRules', () => {
    test('should return number of cleaned rules', () => {
      const count = osIsolationWindows.cleanupAllRules();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});

describe.skipIf(isWindows)('Windows Network Isolation (Non-Windows)', () => {
  test('should return not supported on non-Windows platforms', async () => {
    const { detectWindowsFirewall } = await import('./os-isolation-windows.js');
    const result = detectWindowsFirewall();
    expect(result.supported).toBe(false);
    expect(result.error).toContain('Not Windows');
  });
});
