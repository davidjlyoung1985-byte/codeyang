import { describe, test, expect } from 'vitest';
import {
  detectNetworkIsolationSupport,
  wrapCommandWithNetworkIsolation,
  getNetworkIsolationStatus,
} from './os-isolation.js';
import { platform } from 'node:os';

describe('OS Isolation', () => {
  describe('detectNetworkIsolationSupport', () => {
    test('should detect platform capabilities', () => {
      const capabilities = detectNetworkIsolationSupport();

      expect(capabilities).toHaveProperty('supported');

      if (capabilities.supported) {
        expect(capabilities.method).toBeDefined();
      } else {
        expect(capabilities.error).toBeDefined();
      }
    });

    test('should return correct capabilities for current platform', () => {
      const capabilities = detectNetworkIsolationSupport();
      const os = platform();

      if (os === 'linux') {
        // Linux 可能支持（取决于 unshare 是否可用）
        if (capabilities.supported) {
          expect(capabilities.method).toBe('unshare');
        }
      } else if (os === 'win32' || os === 'darwin') {
        // Windows 和 macOS 当前不支持
        expect(capabilities.supported).toBe(false);
        expect(capabilities.error).toBeDefined();
      }
    });

    test('should handle missing unshare gracefully', () => {
      const capabilities = detectNetworkIsolationSupport();

      // 无论是否支持，都不应该抛出异常
      expect(capabilities).toBeDefined();
    });
  });

  describe('wrapCommandWithNetworkIsolation', () => {
    test('should throw on unsupported platforms', () => {
      const capabilities = detectNetworkIsolationSupport();

      if (!capabilities.supported) {
        expect(() => {
          wrapCommandWithNetworkIsolation('echo', ['hello']);
        }).toThrow('Network isolation not supported');
      }
    });

    test('should wrap command with unshare on Linux (if supported)', () => {
      const capabilities = detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.method === 'unshare' && !capabilities.requiresRoot) {
        const { command, args } = wrapCommandWithNetworkIsolation('node', ['-v']);

        expect(command).toBe('unshare');
        expect(args).toEqual(['--net', '--', 'node', '-v']);
      }
    });

    test('should preserve all original arguments', () => {
      const capabilities = detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.method === 'unshare' && !capabilities.requiresRoot) {
        const originalArgs = ['arg1', 'arg2', '--flag', 'value'];
        const { args } = wrapCommandWithNetworkIsolation('cmd', originalArgs);

        // 应该包含所有原始参数
        expect(args.slice(3)).toEqual(originalArgs);
      }
    });
  });

  describe('getNetworkIsolationStatus', () => {
    test('should return human-readable status', () => {
      const status = getNetworkIsolationStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);

      // 应该以表情符号开头（✅, ⚠️, ❌）
      expect(status).toMatch(/^[✅⚠️❌]/);
    });

    test('should reflect actual capabilities', () => {
      const status = getNetworkIsolationStatus();
      const capabilities = detectNetworkIsolationSupport();

      if (capabilities.supported) {
        expect(status).toContain(capabilities.method);

        if (capabilities.requiresRoot) {
          expect(status).toContain('⚠️');
          expect(status).toContain('privileges');
        } else {
          expect(status).toContain('✅');
        }
      } else {
        expect(status).toContain('❌');
        expect(status).toContain('not supported');
      }
    });
  });

  describe('Platform-specific behavior', () => {
    test('Linux should attempt unshare detection', () => {
      if (platform() === 'linux') {
        const capabilities = detectNetworkIsolationSupport();

        // 在 Linux 上应该检测 unshare
        if (capabilities.supported) {
          expect(capabilities.method).toBe('unshare');
        } else {
          // 如果不支持，应该有明确的错误原因
          expect(capabilities.error).toContain('unshare');
        }
      }
    });

    test('Windows should report unsupported', () => {
      if (platform() === 'win32') {
        const capabilities = detectNetworkIsolationSupport();

        expect(capabilities.supported).toBe(false);
        expect(capabilities.error).toContain('Windows');
      }
    });

    test('macOS should report unsupported', () => {
      if (platform() === 'darwin') {
        const capabilities = detectNetworkIsolationSupport();

        expect(capabilities.supported).toBe(false);
        expect(capabilities.error).toContain('macOS');
      }
    });
  });

  describe('CI environment compatibility', () => {
    test('should not fail in CI without root', () => {
      const isCI = process.env.CI === 'true';

      if (isCI) {
        // 在 CI 中检测能力不应该抛出异常
        expect(() => {
          detectNetworkIsolationSupport();
        }).not.toThrow();

        // 状态应该正常返回
        expect(() => {
          getNetworkIsolationStatus();
        }).not.toThrow();
      }
    });

    test('should gracefully handle permission errors', () => {
      const capabilities = detectNetworkIsolationSupport();

      // 无论是否有权限，都应该有清晰的状态
      if (capabilities.requiresRoot) {
        expect(capabilities.error).toContain('privileges');
      }
    });
  });
});
