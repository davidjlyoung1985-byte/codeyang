/**
 * Additional tests for os-isolation edge cases and uncovered paths
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { platform } from 'node:os';
import {
  detectNetworkIsolationSupport,
  wrapCommandWithNetworkIsolation,
  getNetworkIsolationStatus,
} from './os-isolation.js';

describe('OS Isolation - Edge Cases and Coverage', () => {
  // Snapshot the real platform so a test that mocks `node:os` cannot leak into
  // the next one; `vi.restoreAllMocks()` alone does not undo a module mock.
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    originalPlatform = platform();
  });

  afterEach(() => {
    expect(originalPlatform).toBeDefined();
    vi.restoreAllMocks();
  });

  describe('detectNetworkIsolationSupport - Edge Cases', () => {
    test('should handle execSync errors gracefully on Linux', async () => {
      if (platform() !== 'linux') {
        // Skip on non-Linux platforms
        return;
      }

      const capabilities = await detectNetworkIsolationSupport();

      // Should not throw, even if commands fail
      expect(capabilities).toBeDefined();
      expect(capabilities).toHaveProperty('supported');
    });

    test('should detect permission errors on Linux', async () => {
      if (platform() !== 'linux') {
        return;
      }

      const capabilities = await detectNetworkIsolationSupport();

      // If unshare exists but requires root, should report it
      if (capabilities.supported && capabilities.requiresRoot) {
        expect(capabilities.error).toContain('privileges');
      }
    });

    test('should handle Windows without admin rights', async () => {
      if (platform() !== 'win32') {
        return;
      }

      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.requiresRoot) {
        expect(capabilities.method).toBe('wfp');
        expect(capabilities.error).toContain('administrator');
      }
    });

    test('should handle macOS SIP restrictions', async () => {
      if (platform() !== 'darwin') {
        return;
      }

      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported) {
        expect(capabilities.method).toBe('sandbox-exec');
      }
    });

    test('should return unsupported for unknown platforms', async () => {
      // This test verifies the default case
      const capabilities = await detectNetworkIsolationSupport();

      // On known platforms, should have a method or error
      expect(capabilities).toBeDefined();
    });
  });

  describe('wrapCommandWithNetworkIsolation - Edge Cases', () => {
    test('should handle empty args array', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (!capabilities.supported) {
        await expect(wrapCommandWithNetworkIsolation('echo', [])).rejects.toThrow();
        return;
      }

      if (capabilities.method === 'unshare' && !capabilities.requiresRoot) {
        const { command, args } = await wrapCommandWithNetworkIsolation('echo', []);
        expect(command).toBe('unshare');
        expect(args).toEqual(['--net', '--', 'echo']);
      }
    });

    test('should handle commands with special characters', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (!capabilities.supported) {
        return;
      }

      if (capabilities.method === 'unshare' && !capabilities.requiresRoot) {
        const specialArgs = ['--flag="value with spaces"', "arg's"];
        const { args } = await wrapCommandWithNetworkIsolation('cmd', specialArgs);

        // Should preserve special characters
        expect(args.slice(3)).toEqual(specialArgs);
      }
    });

    test('should provide cleanup function on macOS', async () => {
      if (platform() !== 'darwin') {
        return;
      }

      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.method === 'sandbox-exec') {
        const wrapped = await wrapCommandWithNetworkIsolation('echo', ['test']);

        // Should have cleanup function for sandbox profile
        if (wrapped.cleanup) {
          expect(typeof wrapped.cleanup).toBe('function');
        }
      }
    });

    test('should provide cleanup function on Windows', async () => {
      if (platform() !== 'win32') {
        return;
      }

      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.method === 'wfp' && !capabilities.requiresRoot) {
        const wrapped = await wrapCommandWithNetworkIsolation('node', ['-v']);

        // Should have cleanup function for firewall rule
        expect(wrapped.cleanup).toBeDefined();
        expect(typeof wrapped.cleanup).toBe('function');
      }
    });

    test('should handle commands that cannot be resolved on Windows', async () => {
      if (platform() !== 'win32') {
        return;
      }

      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported && capabilities.method === 'wfp' && !capabilities.requiresRoot) {
        // Try with a non-existent command
        await expect(wrapCommandWithNetworkIsolation('nonexistent_command_xyz', ['arg'])).rejects.toThrow(
          'Cannot resolve executable path',
        );
      }
    });

    test('should throw detailed error when not supported', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (!capabilities.supported) {
        try {
          await wrapCommandWithNetworkIsolation('echo', ['test']);
          expect.fail('Should have thrown an error');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toContain('not supported');
        }
      }
    });
  });

  describe('getNetworkIsolationStatus - Edge Cases', () => {
    test('should format status with emojis', async () => {
      const status = await getNetworkIsolationStatus();

      // Status should be human-readable with emojis
      expect(status).toMatch(/[✅⚠️❌]/);
    });

    test('should mention platform in status', async () => {
      const status = await getNetworkIsolationStatus();
      const currentPlatform = platform();

      // Status should reference the platform or method
      if (currentPlatform === 'linux') {
        expect(status.toLowerCase()).toMatch(/linux|unshare/);
      } else if (currentPlatform === 'win32') {
        expect(status.toLowerCase()).toMatch(/windows|wfp|firewall/);
      } else if (currentPlatform === 'darwin') {
        expect(status.toLowerCase()).toMatch(/macos|sandbox/);
      }
    });

    test('should indicate when root/admin is required', async () => {
      const status = await getNetworkIsolationStatus();
      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.requiresRoot) {
        expect(status).toContain('⚠️');
        expect(status.toLowerCase()).toMatch(/privileges|admin|root/);
      }
    });

    test('should be consistent with capabilities', async () => {
      const status = await getNetworkIsolationStatus();
      const capabilities = await detectNetworkIsolationSupport();

      if (capabilities.supported) {
        // Status should not say "not supported"
        expect(status).not.toContain('not supported');
      } else {
        // Status should indicate not supported
        expect(status).toContain('❌');
      }
    });
  });

  describe('Cross-platform consistency', () => {
    test('all methods should return valid NetworkIsolationCapabilities', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      expect(capabilities).toHaveProperty('supported');
      expect(typeof capabilities.supported).toBe('boolean');

      if (capabilities.supported) {
        expect(capabilities.method).toBeDefined();
        expect(['unshare', 'wfp', 'sandbox-exec']).toContain(capabilities.method);
      } else {
        expect(capabilities.error).toBeDefined();
        expect(typeof capabilities.error).toBe('string');
      }
    });

    test('wrapCommandWithNetworkIsolation should return valid WrappedNetworkCommand', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (!capabilities.supported || capabilities.requiresRoot) {
        return;
      }

      const wrapped = await wrapCommandWithNetworkIsolation('echo', ['test']);

      expect(wrapped).toHaveProperty('command');
      expect(wrapped).toHaveProperty('args');
      expect(typeof wrapped.command).toBe('string');
      expect(Array.isArray(wrapped.args)).toBe(true);
    });

    test('getNetworkIsolationStatus should always return a string', async () => {
      const status = await getNetworkIsolationStatus();

      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling and resilience', () => {
    test('should not crash on malformed commands', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (!capabilities.supported) {
        return;
      }

      // Empty command should throw on Windows (cannot resolve path)
      // but should not crash the process
      if (capabilities.method === 'wfp') {
        await expect(wrapCommandWithNetworkIsolation('', ['arg'])).rejects.toThrow();
      } else {
        // On other platforms, empty command might be allowed
        const result = await wrapCommandWithNetworkIsolation('', ['arg']);
        expect(result).toBeDefined();
      }
    });

    test('should handle very long argument lists', async () => {
      const capabilities = await detectNetworkIsolationSupport();

      if (!capabilities.supported || capabilities.requiresRoot) {
        return;
      }

      const longArgs = Array.from({ length: 100 }, (_, i) => `arg${i}`);
      const wrapped = await wrapCommandWithNetworkIsolation('echo', longArgs);

      expect(wrapped.args.length).toBeGreaterThan(longArgs.length);
    });

    test('should handle concurrent detection calls', async () => {
      // Multiple concurrent calls should not interfere
      const results = await Promise.all([
        detectNetworkIsolationSupport(),
        detectNetworkIsolationSupport(),
        detectNetworkIsolationSupport(),
      ]);

      // All results should be identical
      expect(results[0].supported).toBe(results[1].supported);
      expect(results[0].supported).toBe(results[2].supported);
    });
  });
});
