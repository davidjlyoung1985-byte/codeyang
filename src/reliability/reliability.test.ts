import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionRecoveryManager } from './SessionRecovery.js';
import { ErrorRecoveryManager, CircuitBreaker, CircuitState } from './ErrorRecovery.js';
import { HealthChecker, HealthStatus } from './HealthChecker.js';
import { existsSync } from 'node:fs';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

describe('SessionRecoveryManager', () => {
  let recovery: SessionRecoveryManager;
  const testDir = join(process.cwd(), '.test-checkpoints');

  beforeEach(async () => {
    recovery = new SessionRecoveryManager({ checkpointDir: testDir });
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    recovery.cleanup();
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('should create and recover checkpoint', async () => {
    const checkpoint = {
      sessionId: 'test-session',
      timestamp: Date.now(),
      messages: [{ role: 'user' as const, content: 'test' }],
      context: { foo: 'bar' },
      metadata: { model: 'claude', totalTokens: 100, turnCount: 1 },
    };

    await recovery.createCheckpoint(checkpoint);
    const recovered = await recovery.recoverFromCheckpoint('test-session');

    expect(recovered).toBeDefined();
    expect(recovered?.sessionId).toBe('test-session');
    expect(recovered?.context.foo).toBe('bar');
  });

  it('should return null for non-existent session', async () => {
    const recovered = await recovery.recoverFromCheckpoint('non-existent');
    expect(recovered).toBeNull();
  });

  it('should prune old checkpoints', async () => {
    const sessionId = 'test-session';

    // Create more checkpoints than maxCheckpoints
    for (let i = 0; i < 12; i++) {
      await recovery.createCheckpoint({
        sessionId,
        timestamp: Date.now() + i,
        messages: [],
        context: {},
        metadata: { model: 'claude', totalTokens: 0, turnCount: i },
      });
    }

    const checkpoints = await recovery.listCheckpoints(sessionId);
    expect(checkpoints.length).toBeLessThanOrEqual(10); // maxCheckpoints default is 10
  });

  it('should enable and disable auto-save', async () => {
    const sessionId = 'auto-save-test';
    let callCount = 0;

    const getCheckpoint = async () => ({
      sessionId,
      timestamp: Date.now(),
      messages: [],
      context: { count: callCount++ },
      metadata: { model: 'claude', totalTokens: 0, turnCount: 0 },
    });

    recovery.enableAutoSave(sessionId, getCheckpoint);
    recovery.disableAutoSave(sessionId);

    // Should not crash
    expect(true).toBe(true);
  });
});

describe('ErrorRecoveryManager', () => {
  let errorRecovery: ErrorRecoveryManager;

  beforeEach(() => {
    errorRecovery = new ErrorRecoveryManager();
  });

  it('should retry failed operation', async () => {
    let attempts = 0;

    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('ETIMEDOUT');
      }
      return 'success';
    };

    const result = await errorRecovery.retryWithBackoff(operation, { maxRetries: 3, baseDelay: 10 });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should not retry non-retryable errors', async () => {
    let attempts = 0;

    const operation = async () => {
      attempts++;
      throw new Error('INVALID_INPUT');
    };

    await expect(errorRecovery.retryWithBackoff(operation, { maxRetries: 3, baseDelay: 10 })).rejects.toThrow(
      'INVALID_INPUT',
    );
    expect(attempts).toBe(1); // Should fail immediately
  });

  it('should respect max retries', async () => {
    let attempts = 0;

    const operation = async () => {
      attempts++;
      throw new Error('ETIMEDOUT');
    };

    await expect(errorRecovery.retryWithBackoff(operation, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow(
      'ETIMEDOUT',
    );
    expect(attempts).toBe(3); // Initial + 2 retries
  });

  it('should execute with timeout', async () => {
    const slowOperation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'done';
    };

    await expect(errorRecovery.executeWithTimeout(slowOperation, 50)).rejects.toThrow('timed out');
  });

  it('should execute with fallback', async () => {
    const primary = async () => {
      throw new Error('Primary failed');
    };

    const fallback = async () => 'fallback result';

    const result = await errorRecovery.executeWithFallback(primary, fallback);
    expect(result).toBe('fallback result');
  });
});

describe('CircuitBreaker', () => {
  it('should open circuit after failures', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, timeout: 100 });

    const failingOperation = async () => {
      throw new Error('Service down');
    };

    // Fail 3 times to open circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOperation)).rejects.toThrow('Service down');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Next call should be blocked
    await expect(breaker.execute(failingOperation)).rejects.toThrow('Circuit breaker is OPEN');
  });

  it('should transition to half-open after timeout', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 50, successThreshold: 1 });

    const failingOperation = async () => {
      throw new Error('Fail');
    };

    // Open circuit
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(failingOperation)).rejects.toThrow('Fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Should transition to HALF_OPEN and allow test
    const successOperation = async () => 'success';
    await expect(breaker.execute(successOperation)).resolves.toBe('success');

    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  afterEach(() => {
    checker.stopPeriodicChecks();
  });

  it('should run health checks', async () => {
    const report = await checker.checkHealth();

    expect(report.status).toBeDefined();
    expect(report.checks).toBeDefined();
    expect(report.checks.memory).toBeDefined();
    expect(report.checks.event_loop).toBeDefined();
    expect(report.uptime).toBeGreaterThan(0);
  });

  it('should register custom health check', async () => {
    checker.registerCheck('custom', async () => ({
      name: 'custom',
      status: HealthStatus.HEALTHY,
      message: 'All good',
      lastCheck: Date.now(),
    }));

    const report = await checker.checkHealth();
    expect(report.checks.custom).toBeDefined();
    expect(report.checks.custom.status).toBe(HealthStatus.HEALTHY);
  });

  it('should detect unhealthy status', async () => {
    checker.registerCheck('failing', async () => ({
      name: 'failing',
      status: HealthStatus.UNHEALTHY,
      message: 'Service down',
      lastCheck: Date.now(),
    }));

    const report = await checker.checkHealth();
    expect(report.status).toBe(HealthStatus.UNHEALTHY);
  });

  it('should register and execute heal action', async () => {
    let healed = false;

    checker.registerHealAction('test_issue', {
      issue: 'test_issue',
      description: 'Test healing',
      action: async () => {
        healed = true;
        return true;
      },
    });

    const success = await checker.selfHeal('test_issue');
    expect(success).toBe(true);
    expect(healed).toBe(true);
  });

  it('should start and stop periodic checks', () => {
    checker.startPeriodicChecks(1000);
    checker.stopPeriodicChecks();
    // Should not crash
    expect(true).toBe(true);
  });
});
