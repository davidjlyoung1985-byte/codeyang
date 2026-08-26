import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, type CircuitState } from './index.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      probeTimeoutMs: 500,
      maxProbeConcurrency: 2,
      slowCallThresholdMs: 200,
      windowSize: 10,
      failureRateThreshold: 0.5,
      minRequestCount: 5,
    });
  });

  describe('initialization', () => {
    it('creates a circuit breaker with given name', () => {
      expect(breaker.name).toBe('test-circuit');
    });

    it('starts in CLOSED state', () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
    });

    it('accepts partial config', () => {
      const custom = new CircuitBreaker('custom', { failureThreshold: 10 });
      const config = custom.getConfig();
      expect(config.failureThreshold).toBe(10);
    });

    it('uses default config when not provided', () => {
      const defaultBreaker = new CircuitBreaker('default');
      const config = defaultBreaker.getConfig();
      expect(config.failureThreshold).toBeGreaterThan(0);
      expect(config.resetTimeoutMs).toBeGreaterThan(0);
    });
  });

  describe('successful calls', () => {
    it('executes function successfully', async () => {
      const fn = vi.fn(async () => 'success');
      const result = await breaker.call(fn);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.fallback).toBe(false);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('tracks success count', async () => {
      await breaker.call(async () => 'ok');
      await breaker.call(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.successCount).toBe(2);
      expect(stats.totalCalls).toBe(2);
    });

    it('records duration', async () => {
      const result = await breaker.call(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('stays in CLOSED state after success', async () => {
      await breaker.call(async () => 'ok');
      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
    });
  });

  describe('failed calls', () => {
    it('handles failures', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Test error');
      });
      const result = await breaker.call(fn);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });

    it('tracks failure count', async () => {
      await breaker.call(async () => {
        throw new Error('fail');
      });
      await breaker.call(async () => {
        throw new Error('fail');
      });

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(2);
      expect(stats.totalCalls).toBe(2);
    });

    it('tracks consecutive failures', async () => {
      await breaker.call(async () => {
        throw new Error('fail');
      });
      await breaker.call(async () => {
        throw new Error('fail');
      });

      const stats = breaker.getStats();
      expect(stats.consecutiveFailures).toBe(2);
    });

    it('resets consecutive failures on success', async () => {
      await breaker.call(async () => {
        throw new Error('fail');
      });
      await breaker.call(async () => {
        throw new Error('fail');
      });
      await breaker.call(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.consecutiveSuccesses).toBe(1);
    });
  });

  describe('state transitions', () => {
    it('transitions to OPEN after exceeding failure threshold', async () => {
      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await breaker.call(async () => {
          throw new Error('fail');
        });
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe('OPEN');
      expect(stats.openCount).toBe(1);
    });

    it('rejects calls when OPEN', async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await breaker.call(async () => {
          throw new Error('fail');
        });
      }

      // Should reject without calling function
      const fn = vi.fn(async () => 'should not run');
      const result = await breaker.call(fn);

      expect(result.success).toBe(false);
      expect(result.fallback).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    });

    it('transitions to HALF_OPEN after reset timeout', async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await breaker.call(async () => {
          throw new Error('fail');
        });
      }

      expect(breaker.getStats().state).toBe('OPEN');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Next call should transition to HALF_OPEN, then if successful, to CLOSED
      const probePromise = breaker.call(async () => {
        // During this execution, we're in HALF_OPEN
        const currentState = breaker.getStats().state;
        expect(currentState).toBe('HALF_OPEN');
        return 'probe';
      });

      await probePromise;

      // After successful probe, should be CLOSED
      expect(breaker.getStats().state).toBe('CLOSED');
    });

    it('transitions to CLOSED from HALF_OPEN on success', async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await breaker.call(async () => {
          throw new Error('fail');
        });
      }

      // Wait and probe successfully
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await breaker.call(async () => 'success');

      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
    });

    it('transitions back to OPEN from HALF_OPEN on failure', async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await breaker.call(async () => {
          throw new Error('fail');
        });
      }

      // Wait and probe with failure
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await breaker.call(async () => {
        throw new Error('probe failed');
      });

      const stats = breaker.getStats();
      expect(stats.state).toBe('OPEN');
    });
  });

  describe('HALF_OPEN concurrency control', () => {
    it('limits concurrent probes', async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await breaker.call(async () => {
          throw new Error('fail');
        });
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Start 3 probes concurrently (max is 2)
      const probes = [
        breaker.call(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'p1';
        }),
        breaker.call(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'p2';
        }),
        breaker.call(async () => 'p3'),
      ];

      const results = await Promise.all(probes);

      // At least one should be rejected due to concurrency limit
      const rejected = results.filter((r) => r.fallback);
      expect(rejected.length).toBeGreaterThan(0);
    });
  });

  describe('slow call detection', () => {
    it('detects slow calls', async () => {
      const result = await breaker.call(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return 'slow';
      });

      expect(result.success).toBe(true);
      expect(result.error).toContain('slow call');
    });

    it('counts slow calls as failures', async () => {
      await breaker.call(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return 'slow';
      });

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(1);
    });
  });

  describe('timeout handling', () => {
    it('times out long-running operations', async () => {
      const result = await breaker.call(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return 'never completes';
        },
        { timeoutMs: 100 },
      );

      expect(result.success).toBe(false);
      expect(result.durationMs).toBeLessThan(200);
    });
  });

  describe('statistics', () => {
    it('calculates failure rate', async () => {
      // 3 successes, 2 failures
      await breaker.call(async () => 'ok');
      await breaker.call(async () => 'ok');
      await breaker.call(async () => {
        throw new Error('fail');
      });
      await breaker.call(async () => 'ok');
      await breaker.call(async () => {
        throw new Error('fail');
      });

      const stats = breaker.getStats();
      expect(stats.failureRate).toBeCloseTo(0.4, 1); // 2/5 = 0.4
    });

    it('tracks average duration', async () => {
      await breaker.call(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'ok';
      });
      await breaker.call(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'ok';
      });

      const stats = breaker.getStats();
      expect(stats.avgDurationMs).toBeGreaterThan(0);
    });

    it('records last failure timestamp', async () => {
      const before = Date.now();
      await breaker.call(async () => {
        throw new Error('fail');
      });
      const after = Date.now();

      const stats = breaker.getStats();
      expect(stats.lastFailureAt).toBeGreaterThanOrEqual(before);
      expect(stats.lastFailureAt).toBeLessThanOrEqual(after);
    });

    it('records last success timestamp', async () => {
      const before = Date.now();
      await breaker.call(async () => 'ok');
      const after = Date.now();

      const stats = breaker.getStats();
      expect(stats.lastSuccessAt).toBeGreaterThanOrEqual(before);
      expect(stats.lastSuccessAt).toBeLessThanOrEqual(after);
    });
  });

  describe('configuration', () => {
    it('allows updating config', () => {
      breaker.setConfig({ failureThreshold: 10 });
      const config = breaker.getConfig();
      expect(config.failureThreshold).toBe(10);
    });

    it('merges config updates', () => {
      const originalResetTimeout = breaker.getConfig().resetTimeoutMs;
      breaker.setConfig({ failureThreshold: 10 });
      const config = breaker.getConfig();

      expect(config.failureThreshold).toBe(10);
      expect(config.resetTimeoutMs).toBe(originalResetTimeout);
    });
  });

  describe('reset', () => {
    it('resets circuit breaker state', async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await breaker.call(async () => {
          throw new Error('fail');
        });
      }

      expect(breaker.getStats().state).toBe('OPEN');

      breaker.reset();

      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles synchronous errors', async () => {
      const result = await breaker.call(async () => {
        throw new Error('sync error');
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('sync error');
    });

    it('handles non-Error throws', async () => {
      const result = await breaker.call(async () => {
        throw 'string error';
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('handles null/undefined returns', async () => {
      const result1 = await breaker.call(async () => null);
      const result2 = await breaker.call(async () => undefined);

      expect(result1.success).toBe(true);
      expect(result1.data).toBe(null);
      expect(result2.success).toBe(true);
      expect(result2.data).toBe(undefined);
    });

    it('handles zero timeout', async () => {
      const result = await breaker.call(async () => 'ok', { timeoutMs: 0 });

      expect(result.success).toBe(true);
      expect(result.data).toBe('ok');
    });
  });
});
