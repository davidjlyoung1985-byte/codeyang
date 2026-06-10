import { describe, it, expect, vi, afterEach } from 'vitest';

describe('checkNodeVersion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes on Node >= 18', async () => {
    const { checkNodeVersion } = await import('./nodeVersionCheck.js');
    expect(() => checkNodeVersion()).not.toThrow();
  });

  it('exits on Node < 18', async () => {
    vi.spyOn(process.versions, 'node', 'get').mockReturnValue('12.0.0');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const { checkNodeVersion } = await import('./nodeVersionCheck.js');
    checkNodeVersion();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
