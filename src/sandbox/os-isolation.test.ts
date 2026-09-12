import { describe, test, expect } from 'vitest';
import {
  detectNetworkIsolationSupport,
  wrapCommandWithNetworkIsolation,
  getNetworkIsolationStatus,
} from './os-isolation.js';
import { platform } from 'node:os';

// NOTE: the detection/wrap/status helpers are async (they probe for `unshare`
// on Linux), so every call site here must await them. This file previously
// called them synchronously, which silently broke when the implementation
// became async.
describe('OS Isolation', () => {
  describe('detectNetworkIsolationSupport', () => {
    test('should detect platform capabilities', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      expect(capabilities).toHaveProperty('supported');

      if (capabilities.supported) {
        expect(capabilities.method).toBeDefined();
      } else {
        expect(capabilities.error).toBeDefined();
      }
    });

    test('should return correct capabilities for current platform', async () => {
      const capabilities = await detectNetworkIsolationSupport();
      const os = platform();

      if (os === 'linux') {
        // Linux 可能支持（取决于 unshare 是否可用）
        if (capabilities.supported) {
          expect(capabilities.method).toBe('unshare');
        }
      } else if (os === 'win32') {
        // Windows 通过 WFP（Windows Filtering Platform）支持，可能需要管理员权限
        if (capabilities.supported) {
          expect(capabilities.method).toBe('wfp');
        } else {
          expect(capabilities.error).toBeDefined();
        }
      } else if (os === 'darwin') {
        // macOS 通过 sandbox-exec 支持
        if (capabilities.supported) {
          expect(capabilities.method).toBe('sandbox-exec');
        } else {
          expect(capabilities.error).toBeDefined();
        }
      }
    });

    test('should handle missing unshare gracefully', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      // 无论是否支持，都不应该抛出异常
      expect(capabilities).toBeDefined();
    });
  });

  describe('wrapCommandWithNetworkIsolation', () => {
    test('should throw on unsupported platforms', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (!capabilities.supported) {
        await expect(wrapCommandWithNetworkIsolation('echo', ['hello'])).rejects.toThrow(
          'Network isolation not supported',
        );
      }
    });

    test('should wrap command with unshare on Linux (if supported)', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.method === 'unshare' && !capabilities.requiresRoot) {
        const { command, args } = await wrapCommandWithNetworkIsolation('node', ['-v']);

        expect(command).toBe('unshare');
        expect(args).toEqual(['--net', '--', 'node', '-v']);
      }
    });

    test('should preserve all original arguments', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.method === 'unshare' && !capabilities.requiresRoot) {
        const originalArgs = ['arg1', 'arg2', '--flag', 'value'];
        const { args } = await wrapCommandWithNetworkIsolation('cmd', originalArgs);

        // 应该包含所有原始参数
        expect(args.slice(3)).toEqual(originalArgs);
      }
    });
  });

  describe('getNetworkIsolationStatus', () => {
    test('should return human-readable status', async () => {
      const status = await getNetworkIsolationStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);

      // 应该以表情符号开头（✅, ⚠️, ❌）
      expect(status).toMatch(/^[✅⚠️❌]/);
    });

    test('should reflect actual capabilities', async () => {
      const status = await getNetworkIsolationStatus();
      const capabilities = await detectNetworkIsolationSupport();

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
    test('Linux should attempt unshare detection', async () => {
      if (platform() === 'linux') {
        const capabilities = await detectNetworkIsolationSupport();

        // 在 Linux 上应该检测 unshare
        if (capabilities.supported) {
          expect(capabilities.method).toBe('unshare');
        } else {
          // 如果不支持，应该有明确的错误原因
          expect(capabilities.error).toContain('unshare');
        }
      }
    });

    test('Windows should report WFP capabilities or a reason', async () => {
      if (platform() === 'win32') {
        const capabilities = await detectNetworkIsolationSupport();

        if (capabilities.supported) {
          // Windows isolates the network via WFP firewall rules.
          expect(capabilities.method).toBe('wfp');
        } else {
          // If unavailable, there must be a non-empty explanation.
          expect(typeof capabilities.error).toBe('string');
          expect(capabilities.error!.length).toBeGreaterThan(0);
        }
      }
    });

    test('macOS should report sandbox-exec capabilities or a reason', async () => {
      if (platform() === 'darwin') {
        const capabilities = await detectNetworkIsolationSupport();

        if (capabilities.supported) {
          expect(capabilities.method).toBe('sandbox-exec');
        } else {
          expect(typeof capabilities.error).toBe('string');
          expect(capabilities.error!.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('CI environment compatibility', () => {
    test('should not fail in CI without root', async () => {
      const isCI = process.env.CI === 'true';

      if (isCI) {
        // 在 CI 中检测能力不应该抛出异常
        await expect(detectNetworkIsolationSupport()).resolves.toBeDefined();

        // 状态应该正常返回
        await expect(getNetworkIsolationStatus()).resolves.toBeTypeOf('string');
      }
    });

    test('should gracefully handle permission errors', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      // 无论是否有权限，都应该有清晰的状态
      if (capabilities.requiresRoot) {
        expect(capabilities.error).toContain('privileges');
      }
    });
  });
});
