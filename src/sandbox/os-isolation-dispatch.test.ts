import { describe, test, expect, vi, beforeEach } from 'vitest';

// Simulate macOS / Windows regardless of the host running the suite.
const state = vi.hoisted(() => ({ platform: 'win32' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, platform: () => state.platform };
});

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => 'C:\\Windows\\System32\\PING.EXE\n'),
}));

const winMock = vi.hoisted(() => ({
  createNetworkBlockRule: vi.fn(),
  removeNetworkBlockRule: vi.fn(),
}));
const macMock = vi.hoisted(() => ({
  wrapCommandWithSandbox: vi.fn(),
  cleanupSandboxProfile: vi.fn(),
}));

vi.mock('./os-isolation-windows.js', () => ({
  detectWindowsFirewall: () => ({ supported: true, requiresAdmin: false }),
  createNetworkBlockRule: winMock.createNetworkBlockRule,
  removeNetworkBlockRule: winMock.removeNetworkBlockRule,
}));

vi.mock('./os-isolation-macos.js', () => ({
  detectMacOSSandbox: () => ({ supported: true, requiresSIPDisabled: false }),
  wrapCommandWithSandbox: macMock.wrapCommandWithSandbox,
  cleanupSandboxProfile: macMock.cleanupSandboxProfile,
}));

const { detectNetworkIsolationSupport, wrapCommandWithNetworkIsolation } = await import('./os-isolation.js');

describe('OS isolation dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('Windows: applies a WFP firewall rule and returns a cleanup that removes it', async () => {
    state.platform = 'win32';
    const caps = await detectNetworkIsolationSupport();
    expect(caps.method).toBe('wfp');

    const wrapped = await wrapCommandWithNetworkIsolation('ping', ['-n', '1', '8.8.8.8']);

    expect(wrapped.command).toBe('ping');
    expect(wrapped.args).toEqual(['-n', '1', '8.8.8.8']);
    expect(winMock.createNetworkBlockRule).toHaveBeenCalledTimes(1);
    const [program, ruleId] = winMock.createNetworkBlockRule.mock.calls[0];
    expect(program).toContain('PING.EXE');
    expect(typeof ruleId).toBe('string');

    expect(typeof wrapped.cleanup).toBe('function');
    wrapped.cleanup!();
    expect(winMock.removeNetworkBlockRule).toHaveBeenCalledWith(ruleId);
  });

  test('macOS: wraps with sandbox-exec and cleans up the profile', async () => {
    state.platform = 'darwin';
    macMock.wrapCommandWithSandbox.mockReturnValue({
      command: 'sandbox-exec',
      args: ['-f', '/tmp/x.sb', 'ls', '-la'],
      profilePath: '/tmp/x.sb',
    });

    const caps = await detectNetworkIsolationSupport();
    expect(caps.method).toBe('sandbox-exec');

    const wrapped = await wrapCommandWithNetworkIsolation('ls', ['-la']);
    expect(wrapped.command).toBe('sandbox-exec');
    expect(wrapped.args[0]).toBe('-f');

    expect(typeof wrapped.cleanup).toBe('function');
    wrapped.cleanup!();
    expect(macMock.cleanupSandboxProfile).toHaveBeenCalledWith('/tmp/x.sb');
  });
});
