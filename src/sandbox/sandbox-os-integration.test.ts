import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Sandbox } from './index.js';
import * as osIsolation from './os-isolation.js';
import { platform } from 'node:os';

describe('Sandbox OS Network Isolation Integration', () => {
  let detectSpy: ReturnType<typeof vi.spyOn>;
  let wrapSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    detectSpy = vi.spyOn(osIsolation, 'detectNetworkIsolationSupport');
    wrapSpy = vi.spyOn(osIsolation, 'wrapCommandWithNetworkIsolation');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useOsNetworkIsolation integration', () => {
    test('should call detectNetworkIsolationSupport when useOsNetworkIsolation is true', async () => {
      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: true,
        timeoutMs: 1000,
      });

      // 模拟不支持 OS 隔离
      detectSpy.mockReturnValue({
        supported: false,
        error: 'Test: not supported',
      });

      await sandbox.run('echo', ['test']);

      // 应该调用检测函数
      expect(detectSpy).toHaveBeenCalled();
    });

    test('should wrap command when OS isolation is supported', async () => {
      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: true,
        timeoutMs: 1000,
      });

      // 模拟支持 OS 隔离
      detectSpy.mockReturnValue({
        supported: true,
        method: 'unshare',
        requiresRoot: false,
      });

      wrapSpy.mockReturnValue({
        command: 'unshare',
        args: ['--net', '--', 'echo', 'test'],
      });

      await sandbox.run('echo', ['test']);

      // 应该调用包装函数
      expect(wrapSpy).toHaveBeenCalledWith('echo', ['test']);
    });

    test('should NOT wrap command when useOsNetworkIsolation is false', async () => {
      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: false, // 明确禁用
        timeoutMs: 1000,
      });

      await sandbox.run('echo', ['test']);

      // 不应该调用检测或包装函数
      expect(detectSpy).not.toHaveBeenCalled();
      expect(wrapSpy).not.toHaveBeenCalled();
    });

    test('should NOT wrap command when blockNetwork is false', async () => {
      const sandbox = new Sandbox({
        blockNetwork: false,
        useOsNetworkIsolation: true,
        timeoutMs: 1000,
      });

      await sandbox.run('echo', ['test']);

      // blockNetwork 为 false，即使 useOsNetworkIsolation 为 true 也不应该调用
      expect(detectSpy).not.toHaveBeenCalled();
      expect(wrapSpy).not.toHaveBeenCalled();
    });

    test('should fallback gracefully when OS isolation requires root', async () => {
      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: true,
        timeoutMs: 1000,
      });

      // 模拟需要 root 权限
      detectSpy.mockReturnValue({
        supported: true,
        method: 'unshare',
        requiresRoot: true,
        error: 'Requires elevated privileges',
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await sandbox.run('echo', ['test']);

      // 应该检测但不包装
      expect(detectSpy).toHaveBeenCalled();
      expect(wrapSpy).not.toHaveBeenCalled();

      // 应该输出警告
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('requires elevated privileges'));

      consoleSpy.mockRestore();
    });

    test('should fallback gracefully when wrapping throws error', async () => {
      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: true,
        timeoutMs: 1000,
      });

      detectSpy.mockReturnValue({
        supported: true,
        method: 'unshare',
        requiresRoot: false,
      });

      wrapSpy.mockImplementation(() => {
        throw new Error('Test wrapping error');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // 用 node 而非 echo：echo 是 Windows/cmd 内建命令，spawn 无法直接执行（平台无关性）
      const result = await sandbox.run('node', ['-e', 'console.log("ok")']);

      // 应该成功执行（回退到软隔离）
      expect(result.success).toBe(true);

      // 应该输出警告
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('OS network isolation requested but failed'));

      consoleSpy.mockRestore();
    });
  });

  describe('Real OS isolation (platform-specific)', () => {
    test('should actually wrap command on Linux with unshare', async () => {
      if (platform() !== 'linux') {
        // 跳过非 Linux 平台
        return;
      }

      const capabilities = osIsolation.detectNetworkIsolationSupport();

      if (!capabilities.supported || capabilities.requiresRoot) {
        // 跳过不支持或需要 root 的环境
        console.log('Skipping: OS isolation not available or requires root');
        return;
      }

      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: true,
        timeoutMs: 2000,
      });

      // 这应该实际使用 unshare 包装命令
      const result = await sandbox.run('echo', ['hello']);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('hello');
    });
  });

  describe('Environment variable fallback', () => {
    test('should set CODEYANG_SANDBOX_NETWORK_BLOCKED when using soft blocking', async () => {
      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: false, // 软隔离
        timeoutMs: 1000,
      });

      const result = await sandbox.run('node', ['-e', 'console.log(process.env.CODEYANG_SANDBOX_NETWORK_BLOCKED)']);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('1');
    });

    test('should also set env var when OS isolation is enabled', async () => {
      const sandbox = new Sandbox({
        blockNetwork: true,
        useOsNetworkIsolation: true,
        timeoutMs: 1000,
      });

      // 模拟不支持（回退到软隔离）
      detectSpy.mockReturnValue({
        supported: false,
        error: 'Test: not supported',
      });

      const result = await sandbox.run('node', ['-e', 'console.log(process.env.CODEYANG_SANDBOX_NETWORK_BLOCKED)']);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('1');
    });
  });
});
