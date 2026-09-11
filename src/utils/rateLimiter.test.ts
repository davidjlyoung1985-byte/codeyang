import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkRateLimit, resetRateLimit, getRateLimitStats } from './rateLimiter.js';

// Derive limits from the module so these tests never go stale when the
// defaults change (they used to hardcode 30 and broke when bash moved to 200).
const bashLimit = getRateLimitStats('bash')!.max;
const networkLimit = getRateLimitStats('network')!.max;
const fileLimit = getRateLimitStats('file')!.max;
const gitLimit = getRateLimitStats('git')!.max;

describe('rateLimiter', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  afterEach(() => {
    resetRateLimit();
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('allows calls within limit', () => {
      expect(() => checkRateLimit('file')).not.toThrow();
      expect(() => checkRateLimit('file')).not.toThrow();
      expect(() => checkRateLimit('file')).not.toThrow();
    });

    it('allows unlimited calls for unconfigured categories', () => {
      for (let i = 0; i < 200; i++) {
        expect(() => checkRateLimit('unconfigured')).not.toThrow();
      }
    });

    it('throws when exceeding file category limit', () => {
      for (let i = 0; i < fileLimit; i++) {
        checkRateLimit('file');
      }

      expect(() => checkRateLimit('file')).toThrow(/RATE LIMIT/);
      expect(() => checkRateLimit('file')).toThrow(/Too many operations/);
    });

    it('throws when exceeding bash category limit', () => {
      for (let i = 0; i < bashLimit; i++) {
        checkRateLimit('bash');
      }

      expect(() => checkRateLimit('bash')).toThrow(/RATE LIMIT/);
    });

    it('throws when exceeding network category limit', () => {
      for (let i = 0; i < networkLimit; i++) {
        checkRateLimit('network');
      }

      expect(() => checkRateLimit('network')).toThrow(/RATE LIMIT/);
    });

    it('error message includes wait time', () => {
      for (let i = 0; i < bashLimit; i++) {
        checkRateLimit('bash');
      }

      try {
        checkRateLimit('bash');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Wait');
        expect((err as Error).message).toMatch(/\d+s/); // Contains seconds
      }
    });

    it('respects sliding window - allows calls after window expires', async () => {
      vi.useFakeTimers();

      // Make `bashLimit` calls to hit the limit
      for (let i = 0; i < bashLimit; i++) {
        checkRateLimit('bash');
      }

      // Should throw immediately
      expect(() => checkRateLimit('bash')).toThrow();

      // Advance time by 61 seconds (past window)
      vi.advanceTimersByTime(61_000);

      // Should allow calls again
      expect(() => checkRateLimit('bash')).not.toThrow();
    });

    it('handles partial window expiry correctly', async () => {
      vi.useFakeTimers();

      const first = bashLimit - 5;

      // Make most of the calls at t=0
      for (let i = 0; i < first; i++) {
        checkRateLimit('bash');
      }

      // Advance 30 seconds
      vi.advanceTimersByTime(30_000);

      // Make the remaining calls (now at limit)
      for (let i = 0; i < 5; i++) {
        checkRateLimit('bash');
      }

      // Should be at limit
      expect(() => checkRateLimit('bash')).toThrow();

      // Advance another 31 seconds (the first `first` calls should expire)
      vi.advanceTimersByTime(31_000);

      // Should allow more calls (only the last 5 remain in window)
      expect(() => checkRateLimit('bash')).not.toThrow();
    });

    it('tracks different categories independently', () => {
      for (let i = 0; i < bashLimit; i++) {
        checkRateLimit('bash');
      }
      expect(() => checkRateLimit('bash')).toThrow();

      // File category should still work
      expect(() => checkRateLimit('file')).not.toThrow();
      expect(() => checkRateLimit('network')).not.toThrow();
      expect(() => checkRateLimit('git')).not.toThrow();
    });
  });

  describe('resetRateLimit', () => {
    it('resets specific category', () => {
      for (let i = 0; i < bashLimit; i++) {
        checkRateLimit('bash');
      }
      expect(() => checkRateLimit('bash')).toThrow();

      resetRateLimit('bash');
      expect(() => checkRateLimit('bash')).not.toThrow();
    });

    it('resets all categories when no argument', () => {
      for (let i = 0; i < bashLimit; i++) {
        checkRateLimit('bash');
      }
      for (let i = 0; i < networkLimit; i++) {
        checkRateLimit('network');
      }

      expect(() => checkRateLimit('bash')).toThrow();
      expect(() => checkRateLimit('network')).toThrow();

      resetRateLimit();

      expect(() => checkRateLimit('bash')).not.toThrow();
      expect(() => checkRateLimit('network')).not.toThrow();
    });
  });

  describe('getRateLimitStats', () => {
    it('returns null for unconfigured category', () => {
      const stats = getRateLimitStats('unconfigured');
      expect(stats).toBeNull();
    });

    it('returns stats for configured category', () => {
      checkRateLimit('file');
      checkRateLimit('file');
      checkRateLimit('file');

      const stats = getRateLimitStats('file');
      expect(stats).not.toBeNull();
      expect(stats?.current).toBe(3);
      expect(stats?.max).toBe(fileLimit);
      expect(stats?.windowMs).toBe(60_000);
    });

    it('returns current count within window', () => {
      for (let i = 0; i < 15; i++) {
        checkRateLimit('bash');
      }

      const stats = getRateLimitStats('bash');
      expect(stats?.current).toBe(15);
      expect(stats?.max).toBe(bashLimit);
    });

    it('updates after window expiry', async () => {
      vi.useFakeTimers();

      for (let i = 0; i < 20; i++) {
        checkRateLimit('bash');
      }

      let stats = getRateLimitStats('bash');
      expect(stats?.current).toBe(20);

      // Advance time past window
      vi.advanceTimersByTime(61_000);

      stats = getRateLimitStats('bash');
      expect(stats?.current).toBe(0);
    });

    it('reflects rate limit configuration', () => {
      const fileStats = getRateLimitStats('file');
      const bashStats = getRateLimitStats('bash');
      const networkStats = getRateLimitStats('network');
      const gitStats = getRateLimitStats('git');

      expect(fileStats?.max).toBe(fileLimit);
      expect(bashStats?.max).toBe(bashLimit);
      expect(networkStats?.max).toBe(networkLimit);
      expect(gitStats?.max).toBe(gitLimit);
    });
  });

  describe('sliding window behavior', () => {
    it('maintains call order in window', () => {
      vi.useFakeTimers();

      // Make calls at different times
      checkRateLimit('bash'); // t=0
      vi.advanceTimersByTime(10_000);
      checkRateLimit('bash'); // t=10s
      vi.advanceTimersByTime(10_000);
      checkRateLimit('bash'); // t=20s

      const stats = getRateLimitStats('bash');
      expect(stats?.current).toBe(3);

      // Advance to t=61s (first call should expire)
      vi.advanceTimersByTime(41_000);
      const stats2 = getRateLimitStats('bash');
      expect(stats2?.current).toBe(2); // Only last 2 remain
    });

    it('handles rapid burst followed by pause', () => {
      vi.useFakeTimers();

      const burst = bashLimit - 10;

      // Burst close to the limit
      for (let i = 0; i < burst; i++) {
        checkRateLimit('bash');
      }

      expect(getRateLimitStats('bash')?.current).toBe(burst);

      // Wait 30s, fill up to the limit
      vi.advanceTimersByTime(30_000);
      for (let i = 0; i < 10; i++) {
        checkRateLimit('bash');
      }

      expect(getRateLimitStats('bash')?.current).toBe(bashLimit);

      // Should be at limit
      expect(() => checkRateLimit('bash')).toThrow();

      // Wait another 31s (the first burst expires)
      vi.advanceTimersByTime(31_000);
      expect(getRateLimitStats('bash')?.current).toBe(10);

      // Should allow more calls
      expect(() => checkRateLimit('bash')).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles zero calls gracefully', () => {
      const stats = getRateLimitStats('file');
      expect(stats?.current).toBe(0);
    });

    it('handles exact limit boundary', () => {
      for (let i = 0; i < bashLimit; i++) {
        expect(() => checkRateLimit('bash')).not.toThrow();
      }

      // Next call should fail
      expect(() => checkRateLimit('bash')).toThrow();
    });

    it('error message includes correct limit values', () => {
      for (let i = 0; i < bashLimit; i++) {
        checkRateLimit('bash');
      }

      try {
        checkRateLimit('bash');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain(`${bashLimit} calls`);
        expect((err as Error).message).toContain('60s');
      }
    });
  });
});
