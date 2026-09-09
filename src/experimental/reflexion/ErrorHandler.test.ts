/**
 * Tests for Enhanced Error Handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  RetryHandler,
  ErrorClassifier,
  EnhancedErrorHandler,
  type ClassifiedError,
} from './ErrorHandler.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenRequests: 2,
    });
  });

  it('starts in closed state', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('test error'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp, 'test')).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('open');
  });

  it('throws immediately when open', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('test error'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp, 'test')).rejects.toThrow();
    }

    // Next call should fail immediately
    await expect(breaker.execute(failingOp, 'test')).rejects.toThrow('Circuit breaker is OPEN');
    expect(failingOp).toHaveBeenCalledTimes(3); // Should not call operation when open
  });

  it('moves to half-open after timeout', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('test error'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp, 'test')).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('open');

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const successOp = vi.fn().mockResolvedValue('success');
    await breaker.execute(successOp, 'test');

    expect(breaker.getState()).toBe('half-open');
  });

  it('closes after successful half-open requests', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('test error'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp, 'test')).rejects.toThrow();
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const successOp = vi.fn().mockResolvedValue('success');

    // Execute successful operations in half-open state
    await breaker.execute(successOp, 'test');
    await breaker.execute(successOp, 'test');

    expect(breaker.getState()).toBe('closed');
  });

  it('reopens on failure in half-open state', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('test error'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp, 'test')).rejects.toThrow();
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Fail in half-open state
    await expect(breaker.execute(failingOp, 'test')).rejects.toThrow();

    expect(breaker.getState()).toBe('open');
  });

  it('provides accurate stats', async () => {
    const stats = breaker.getStats();
    expect(stats.state).toBe('closed');
    expect(stats.failureCount).toBe(0);
  });

  it('resets correctly', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('test error'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp, 'test')).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('open');

    breaker.reset();

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getStats().failureCount).toBe(0);
  });
});

describe('RetryHandler', () => {
  let handler: RetryHandler;

  beforeEach(() => {
    handler = new RetryHandler({
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      retryableErrors: ['timeout', 'ECONNRESET'],
    });
  });

  it('succeeds on first attempt', async () => {
    const successOp = vi.fn().mockResolvedValue('success');
    const result = await handler.execute(successOp, 'test');

    expect(result).toBe('success');
    expect(successOp).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout error'))
      .mockRejectedValueOnce(new Error('timeout error'))
      .mockResolvedValue('success');

    const result = await handler.execute(op, 'test');

    expect(result).toBe('success');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable error', async () => {
    const op = vi.fn().mockRejectedValue(new Error('invalid request'));

    await expect(handler.execute(op, 'test')).rejects.toThrow('invalid request');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('fails after max attempts', async () => {
    const op = vi.fn().mockRejectedValue(new Error('timeout error'));

    await expect(handler.execute(op, 'test')).rejects.toThrow('timeout error');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    await handler.execute(op, 'test');
    const duration = Date.now() - startTime;

    // Should wait at least 100ms + 200ms = 300ms
    expect(duration).toBeGreaterThanOrEqual(300);
  });
});

describe('ErrorClassifier', () => {
  it('classifies timeout errors as transient', () => {
    const error = new Error('Connection timeout');
    const classification = ErrorClassifier.classify(error);

    expect(classification.category).toBe('transient');
    expect(classification.retryable).toBe(true);
    expect(classification.severity).toBe('medium');
  });

  it('classifies rate limit errors as transient', () => {
    const error = new Error('Rate limit exceeded');
    const classification = ErrorClassifier.classify(error);

    expect(classification.category).toBe('transient');
    expect(classification.retryable).toBe(true);
  });

  it('classifies 4xx errors as client errors', () => {
    const error = new Error('400 Bad Request');
    const classification = ErrorClassifier.classify(error);

    expect(classification.category).toBe('client');
    expect(classification.retryable).toBe(false);
    expect(classification.severity).toBe('high');
  });

  it('classifies 5xx errors as server errors', () => {
    const error = new Error('500 Internal Server Error');
    const classification = ErrorClassifier.classify(error);

    expect(classification.category).toBe('server');
    expect(classification.retryable).toBe(true);
  });

  it('classifies auth errors as critical client errors', () => {
    const error = new Error('Unauthorized: Invalid API key');
    const classification = ErrorClassifier.classify(error);

    expect(classification.category).toBe('client');
    expect(classification.severity).toBe('critical');
    expect(classification.retryable).toBe(false);
  });

  it('classifies parse errors as non-retryable', () => {
    const error = new Error('JSON parse error');
    const classification = ErrorClassifier.classify(error);

    expect(classification.category).toBe('client');
    expect(classification.retryable).toBe(false);
  });

  it('classifies unknown errors', () => {
    const error = new Error('Something weird happened');
    const classification = ErrorClassifier.classify(error);

    expect(classification.category).toBe('unknown');
    expect(classification.retryable).toBe(false);
  });

  it('provides recovery suggestions', () => {
    const timeoutError = new Error('timeout');
    const suggestion = ErrorClassifier.getRecoverySuggestion(timeoutError);

    expect(suggestion).toContain('temporary');
    expect(suggestion).toContain('retry');
  });
});

describe('EnhancedErrorHandler', () => {
  let handler: EnhancedErrorHandler;

  beforeEach(() => {
    handler = new EnhancedErrorHandler(
      {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['timeout'],
      },
      {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        halfOpenRequests: 2,
      },
    );
  });

  it('handles successful operation', async () => {
    const op = vi.fn().mockResolvedValue('success');
    const result = await handler.execute(op, 'test');

    expect(result).toBe('success');
  });

  it('retries on transient errors', async () => {
    const op = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('success');

    const result = await handler.execute(op, 'test');

    expect(result).toBe('success');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('opens circuit breaker after threshold', async () => {
    const op = vi.fn().mockRejectedValue(new Error('timeout'));

    for (let i = 0; i < 3; i++) {
      await expect(handler.execute(op, 'test')).rejects.toThrow();
    }

    const stats = handler.getCircuitBreakerStats();
    expect(stats.state).toBe('open');
  });

  it('attaches classification to errors', async () => {
    const op = vi.fn().mockRejectedValue(new Error('invalid request'));

    try {
      await handler.execute(op, 'test');
    } catch (error: unknown) {
      const classifiedError = error as ClassifiedError;
      expect(classifiedError.classification).toBeDefined();
      expect(classifiedError.classification?.category).toBe('client');
    }
  });

  it('provides circuit breaker stats', () => {
    const stats = handler.getCircuitBreakerStats();

    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failureCount');
  });

  it('resets circuit breaker', async () => {
    const op = vi.fn().mockRejectedValue(new Error('timeout'));

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await expect(handler.execute(op, 'test')).rejects.toThrow();
    }

    handler.resetCircuitBreaker();

    const stats = handler.getCircuitBreakerStats();
    expect(stats.state).toBe('closed');
  });

  it('handles non-retryable errors gracefully', async () => {
    const op = vi.fn().mockRejectedValue(new Error('invalid request'));

    await expect(handler.execute(op, 'test')).rejects.toThrow('invalid request');
    expect(op).toHaveBeenCalledTimes(1); // No retry for non-retryable errors
  });
});
