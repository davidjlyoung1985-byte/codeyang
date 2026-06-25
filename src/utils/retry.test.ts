import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRateLimitError, isTimeoutError, isNetworkError, shouldRetryApiError } from './retry.js';

describe('retry utilities', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after exhausting retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 10 })).rejects.toThrow('persistent failure');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect shouldRetry predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('do not retry'));

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          initialDelayMs: 10,
          shouldRetry: () => false,
        }),
      ).rejects.toThrow('do not retry');

      expect(fn).toHaveBeenCalledTimes(1); // No retry
    });

    it('should apply exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const start = Date.now();
      await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
      });
      const duration = Date.now() - start;

      // Should wait ~100ms + ~200ms = ~300ms
      expect(duration).toBeGreaterThanOrEqual(250);
      expect(duration).toBeLessThan(500);
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const start = Date.now();
      await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 150,
        backoffMultiplier: 10,
      });
      const duration = Date.now() - start;

      // Both retries capped at 150ms
      expect(duration).toBeGreaterThanOrEqual(250);
      expect(duration).toBeLessThan(400);
    });
  });

  describe('error detection', () => {
    it('should detect rate limit errors', () => {
      expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
      expect(isRateLimitError(new Error('429 Too Many Requests'))).toBe(true);
      expect(isRateLimitError(new Error('too many requests'))).toBe(true);
      expect(isRateLimitError(new Error('normal error'))).toBe(false);
    });

    it('should detect timeout errors', () => {
      expect(isTimeoutError(new Error('request timeout'))).toBe(true);
      expect(isTimeoutError(new Error('operation timed out'))).toBe(true);
      expect(isTimeoutError(new Error('normal error'))).toBe(false);
    });

    it('should detect network errors', () => {
      expect(isNetworkError(new Error('network error'))).toBe(true);
      expect(isNetworkError(new Error('ECONNRESET'))).toBe(true);
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isNetworkError(new Error('fetch failed'))).toBe(true);
      expect(isNetworkError(new Error('normal error'))).toBe(false);
    });

    it('should combine error checks for API retries', () => {
      expect(shouldRetryApiError(new Error('rate limit'))).toBe(true);
      expect(shouldRetryApiError(new Error('timeout'))).toBe(true);
      expect(shouldRetryApiError(new Error('ECONNRESET'))).toBe(true);
      expect(shouldRetryApiError(new Error('normal error'))).toBe(false);
    });
  });
});
