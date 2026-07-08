import { describe, it, expect, beforeEach, vi } from 'vitest';

// Save original env
const origDebug = process.env.CODEYANG_DEBUG;
const origFilter = process.env.CODEYANG_DEBUG_FILTER;

// Helper: load debug module with specific env settings (fresh module each time)
async function loadDebug(debugEnabled: boolean, filter?: string) {
  process.env.CODEYANG_DEBUG = debugEnabled ? 'true' : 'false';
  process.env.CODEYANG_DEBUG_FILTER = filter || '';
  vi.resetModules();
  return await import('./debug.js');
}

describe('debugLog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CODEYANG_DEBUG = origDebug;
    process.env.CODEYANG_DEBUG_FILTER = origFilter;
  });

  it('does not call console.debug when debug is disabled', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mod = await loadDebug(false);
    mod.debugLog('test', 'message');
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls console.debug when debug is enabled', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mod = await loadDebug(true);
    mod.debugLog('test', 'hello');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toContain('hello');
  });

  it('includes context when provided', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mod = await loadDebug(true);
    mod.debugLog('test', 'msg', { key: 'val' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toContain('val');
  });

  it('respects filter when set', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mod = await loadDebug(true, 'agent');
    mod.debugLog('tool', 'should be filtered out');
    expect(spy).not.toHaveBeenCalled();
  });

  it('passes filter when category matches', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mod = await loadDebug(true, 'agent');
    mod.debugLog('agent', 'should pass filter');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('debugTime', () => {
  it('returns a timer with end() that returns a number', async () => {
    const mod = await loadDebug(true);
    const timer = mod.debugTime('test-op');
    await new Promise((r) => setTimeout(r, 5));
    const duration = timer.end();
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});

describe('debugInspect', () => {
  it('does not throw when called with various types', async () => {
    const mod = await loadDebug(true);
    expect(() => mod.debugInspect('str', 'hello')).not.toThrow();
    expect(() => mod.debugInspect('num', 42)).not.toThrow();
    expect(() => mod.debugInspect('obj', { a: 1 })).not.toThrow();
    expect(() => mod.debugInspect('null', null)).not.toThrow();
    expect(() => mod.debugInspect('undef', undefined)).not.toThrow();
  });
});

describe('debugTrace', () => {
  it('does not throw when called', async () => {
    const mod = await loadDebug(true);
    expect(() => mod.debugTrace('trace-test')).not.toThrow();
  });
});

describe('debugAssert', () => {
  it('does not throw when condition is true', async () => {
    const mod = await loadDebug(true);
    expect(() => mod.debugAssert(true, 'should not throw')).not.toThrow();
  });

  it('throws when condition is false and debug is enabled', async () => {
    const mod = await loadDebug(true);
    expect(() => mod.debugAssert(false, 'test failure')).toThrow('Debug assertion failed: test failure');
  });

  it('does not throw when debug is disabled even if condition false', async () => {
    const mod = await loadDebug(false);
    expect(() => mod.debugAssert(false, 'should be silent')).not.toThrow();
  });
});

describe('getDebugConfig', () => {
  it('returns enabled= true and filter when debug on', async () => {
    const mod = await loadDebug(true, 'tool,agent');
    const cfg = mod.getDebugConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.filter).toEqual(['tool', 'agent']);
  });

  it('returns disabled when debug off', async () => {
    const mod = await loadDebug(false);
    const cfg = mod.getDebugConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.filter).toEqual([]);
  });
});

describe('setDebugMode', () => {
  it('updates env variables', async () => {
    const mod = await loadDebug(false);
    mod.setDebugMode(true, ['test']);
    expect(process.env.CODEYANG_DEBUG).toBe('true');
    expect(process.env.CODEYANG_DEBUG_FILTER).toBe('test');
  });
});
