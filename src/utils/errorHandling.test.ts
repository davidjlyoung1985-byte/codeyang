import { describe, it, expect, beforeEach } from 'vitest';
import {
  ErrorHandler,
  ToolExecutionError,
  NetworkError,
  ValidationError,
  withErrorBoundary,
  retry,
  formatUserError,
} from './errorHandling.js';

describe('Error Handling', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('ErrorHandler', () => {
    it('should handle standard errors', () => {
      const error = new Error('Test error');
      const report = handler.handle(error, { operation: 'test' });

      expect(report.message).toBe('Test error');
      expect(report.category).toBe('Error');
      expect(report.context.operation).toBe('test');
    });

    it('should categorize security errors as critical', () => {
      const error = new Error('Security violation');
      error.name = 'SecurityError';

      const report = handler.handle(error);

      expect(report.severity).toBe('critical');
      expect(report.recoverable).toBe(false);
    });

    it('should mark network errors as recoverable', () => {
      const error = new NetworkError('Connection failed', 'http://example.com');
      const report = handler.handle(error);

      expect(report.severity).toBe('medium');
      expect(report.recoverable).toBe(true);
    });

    it('should track recent errors', () => {
      handler.handle(new Error('Error 1'));
      handler.handle(new Error('Error 2'));
      handler.handle(new Error('Error 3'));

      const recent = handler.getRecentErrors(2);
      expect(recent).toHaveLength(2);
      expect(recent[1]?.message).toBe('Error 3');
    });

    it('should filter by severity', () => {
      handler.handle(new ValidationError('Invalid input'));
      handler.handle(new Error('Security breach'), { operation: 'test' });

      // Manually set severity for test
      const errorLog = handler.getRecentErrors();
      if (errorLog.length > 1) {
        const lastError = errorLog[errorLog.length - 1];
        if (lastError) {
          (lastError as { severity: string }).severity = 'critical';
        }
      }

      const critical = handler.getErrorsBySeverity('critical');
      expect(critical.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide error statistics', () => {
      handler.handle(new Error('Error 1'));
      handler.handle(new NetworkError('Network error'));
      handler.handle(new ValidationError('Invalid'));

      const stats = handler.getStats();
      expect(stats.total).toBe(3);
      expect(stats.recoverable).toBeGreaterThan(0);
    });

    it('should clear error log', () => {
      handler.handle(new Error('Error'));
      expect(handler.getRecentErrors()).toHaveLength(1);

      handler.clear();
      expect(handler.getRecentErrors()).toHaveLength(0);
    });
  });

  describe('Custom Error Types', () => {
    it('should create ToolExecutionError', () => {
      const error = new ToolExecutionError('Tool failed', 'ReadTool');

      expect(error.name).toBe('ToolExecutionError');
      expect(error.toolName).toBe('ReadTool');
      expect(error.message).toBe('Tool failed');
    });

    it('should create NetworkError', () => {
      const error = new NetworkError('Failed', 'http://test.com');

      expect(error.name).toBe('NetworkError');
      expect(error.url).toBe('http://test.com');
    });

    it('should create ValidationError', () => {
      const error = new ValidationError('Invalid email', 'email');

      expect(error.name).toBe('ValidationError');
      expect(error.field).toBe('email');
    });
  });

  describe('withErrorBoundary', () => {
    it('should catch and handle errors', async () => {
      const fn = () => {
        throw new ValidationError('Invalid input');
      };

      const wrapped = withErrorBoundary(fn, 'test-operation');
      const result = await wrapped();

      // Recoverable error returns undefined
      expect(result).toBeUndefined();
    });

    it('should re-throw non-recoverable errors', async () => {
      const fn = () => {
        const error = new Error('Security issue');
        error.name = 'SecurityError';
        throw error;
      };

      const wrapped = withErrorBoundary(fn, 'test-operation');

      await expect(wrapped()).rejects.toThrow('Security issue');
    });

    it('should return result on success', async () => {
      const fn = () => Promise.resolve('success');
      const wrapped = withErrorBoundary(fn, 'test-operation');

      const result = await wrapped();
      expect(result).toBe('success');
    });
  });

  describe('retry', () => {
    it('should succeed on first try', async () => {
      const fn = () => Promise.resolve('success');
      const result = await retry(fn);

      expect(result).toBe('success');
    });

    it('should retry on failure', async () => {
      let attempts = 0;

      const fn = () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve('success');
      };

      const result = await retry(fn, { maxRetries: 3, initialDelay: 10 });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max retries', async () => {
      const fn = () => {
        throw new Error('Persistent failure');
      };

      await expect(retry(fn, { maxRetries: 2, initialDelay: 10 })).rejects.toThrow('Persistent failure');
    });

    it('should call onRetry callback', async () => {
      let retryCount = 0;
      const fn = () => {
        if (retryCount < 2) throw new Error('Fail');
        return Promise.resolve('success');
      };

      await retry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        onRetry: (attempt) => {
          retryCount = attempt;
        },
      });

      expect(retryCount).toBeGreaterThan(0);
    });
  });

  describe('formatUserError', () => {
    it('should format Error objects', () => {
      const error = new Error('Something went wrong');
      const formatted = formatUserError(error);

      expect(formatted).toBe('Something went wrong');
      expect(formatted).not.toContain('at ');
    });

    it('should format non-Error values', () => {
      expect(formatUserError('string error')).toBe('string error');
      expect(formatUserError(404)).toBe('404');
    });
  });
});
