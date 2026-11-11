/**
 * CodeYangError Tests — 统一错误处理系统测试
 */

import { describe, it, expect } from 'vitest';
import {
  CodeYangError,
  ErrorCode,
  ToolExecutionError,
  LLMApiError,
  FileSystemError,
  NetworkError,
  wrapError,
  isRetryable,
  getRetryDelay,
} from './CodeYangError.js';

describe('CodeYangError', () => {
  describe('Basic Error Creation', () => {
    it('should create error with message and code', () => {
      const error = new CodeYangError('Test error', ErrorCode.TOOL_EXECUTION_FAILED);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
      expect(error.name).toBe('CodeYangError');
    });

    it('should default to UNKNOWN_ERROR code', () => {
      const error = new CodeYangError('Test error');

      expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('should set timestamp', () => {
      const before = Date.now();
      const error = new CodeYangError('Test error');
      const after = Date.now();

      expect(error.timestamp).toBeGreaterThanOrEqual(before);
      expect(error.timestamp).toBeLessThanOrEqual(after);
    });

    it('should have stack trace', () => {
      const error = new CodeYangError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CodeYangError');
    });
  });

  describe('Error Context', () => {
    it('should store context information', () => {
      const error = new CodeYangError('Test error', ErrorCode.TOOL_EXECUTION_FAILED, {
        context: {
          tool: 'Read',
          operation: 'readFile',
          filePath: '/test/file.txt',
        },
      });

      expect(error.context.tool).toBe('Read');
      expect(error.context.operation).toBe('readFile');
      expect(error.context.filePath).toBe('/test/file.txt');
    });

    it('should default to empty context', () => {
      const error = new CodeYangError('Test error');

      expect(error.context).toEqual({});
    });
  });

  describe('Original Error Handling', () => {
    it('should store original error', () => {
      const originalError = new Error('Original error');
      const error = new CodeYangError('Wrapped error', ErrorCode.INTERNAL_ERROR, {
        originalError,
      });

      expect(error.originalError).toBe(originalError);
    });

    it('should append original error stack', () => {
      const originalError = new Error('Original error');
      const error = new CodeYangError('Wrapped error', ErrorCode.INTERNAL_ERROR, {
        originalError,
      });

      expect(error.stack).toContain('Caused by:');
      expect(error.stack).toContain('Original error');
    });
  });

  describe('Recoverability', () => {
    it('should mark rate limit errors as recoverable', () => {
      const error = new CodeYangError('Rate limited', ErrorCode.LLM_RATE_LIMIT);

      expect(error.recoverable).toBe(true);
    });

    it('should mark timeout errors as recoverable', () => {
      const error = new CodeYangError('Timeout', ErrorCode.LLM_TIMEOUT);

      expect(error.recoverable).toBe(true);
    });

    it('should mark file errors as non-recoverable by default', () => {
      const error = new CodeYangError('File not found', ErrorCode.FILE_NOT_FOUND);

      expect(error.recoverable).toBe(false);
    });

    it('should allow manual recoverability override', () => {
      const error = new CodeYangError('Test error', ErrorCode.FILE_NOT_FOUND, {
        recoverable: true,
      });

      expect(error.recoverable).toBe(true);
    });
  });

  describe('Recovery Strategy', () => {
    it('should set retry strategy for rate limit errors', () => {
      const error = new CodeYangError('Rate limited', ErrorCode.LLM_RATE_LIMIT);

      expect(error.recovery.canRetry).toBe(true);
      expect(error.recovery.maxRetries).toBe(3);
      expect(error.recovery.retryDelay).toBe(5000);
    });

    it('should set retry strategy for timeout errors', () => {
      const error = new CodeYangError('Timeout', ErrorCode.NETWORK_TIMEOUT);

      expect(error.recovery.canRetry).toBe(true);
      expect(error.recovery.maxRetries).toBe(2);
      expect(error.recovery.retryDelay).toBe(2000);
    });

    it('should not retry non-retryable errors', () => {
      const error = new CodeYangError('Invalid input', ErrorCode.INVALID_ARGUMENT);

      expect(error.recovery.canRetry).toBe(false);
    });

    it('should allow custom recovery strategy', () => {
      const error = new CodeYangError('Test error', ErrorCode.TOOL_EXECUTION_FAILED, {
        recovery: {
          canRetry: true,
          maxRetries: 5,
          retryDelay: 3000,
          canFallback: true,
          fallbackSuggestion: 'Use alternative tool',
        },
      });

      expect(error.recovery.canRetry).toBe(true);
      expect(error.recovery.maxRetries).toBe(5);
      expect(error.recovery.retryDelay).toBe(3000);
      expect(error.recovery.canFallback).toBe(true);
      expect(error.recovery.fallbackSuggestion).toBe('Use alternative tool');
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize to JSON', () => {
      const error = new CodeYangError('Test error', ErrorCode.TOOL_EXECUTION_FAILED, {
        context: { tool: 'Read' },
      });

      const json = error.toJSON();

      expect(json.name).toBe('CodeYangError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
      expect(json.context).toEqual({ tool: 'Read' });
      expect(json.recoverable).toBeDefined();
      expect(json.timestamp).toBeDefined();
      expect(json.recovery).toBeDefined();
    });
  });

  describe('User Messages', () => {
    it('should provide user-friendly message for LLM_RATE_LIMIT', () => {
      const error = new CodeYangError('API rate limit exceeded', ErrorCode.LLM_RATE_LIMIT);

      expect(error.getUserMessage()).toBe('API 调用频率超限，请稍后重试');
    });

    it('should provide user-friendly message for FILE_NOT_FOUND', () => {
      const error = new CodeYangError('File does not exist', ErrorCode.FILE_NOT_FOUND);

      expect(error.getUserMessage()).toBe('文件不存在');
    });

    it('should fallback to original message for unmapped codes', () => {
      const error = new CodeYangError('Custom error message', ErrorCode.UNKNOWN_ERROR);

      expect(error.getUserMessage()).toBe('未知错误');
    });
  });

  describe('Specialized Error Classes', () => {
    describe('ToolExecutionError', () => {
      it('should create tool execution error', () => {
        const error = new ToolExecutionError('Read', 'Failed to read file');

        expect(error).toBeInstanceOf(CodeYangError);
        expect(error).toBeInstanceOf(ToolExecutionError);
        expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
        expect(error.context.tool).toBe('Read');
        expect(error.recoverable).toBe(false);
      });

      it('should wrap original error', () => {
        const originalError = new Error('ENOENT');
        const error = new ToolExecutionError('Read', 'Failed to read file', originalError);

        expect(error.originalError).toBe(originalError);
      });
    });

    describe('LLMApiError', () => {
      it('should create LLM API error', () => {
        const error = new LLMApiError('API request failed');

        expect(error).toBeInstanceOf(CodeYangError);
        expect(error).toBeInstanceOf(LLMApiError);
        expect(error.code).toBe(ErrorCode.LLM_API_ERROR);
      });

      it('should mark rate limit errors as recoverable', () => {
        const error = new LLMApiError('Rate limited', ErrorCode.LLM_RATE_LIMIT);

        expect(error.recoverable).toBe(true);
      });

      it('should mark timeout errors as recoverable', () => {
        const error = new LLMApiError('Timeout', ErrorCode.LLM_TIMEOUT);

        expect(error.recoverable).toBe(true);
      });
    });

    describe('FileSystemError', () => {
      it('should create file system error', () => {
        const error = new FileSystemError('/test/file.txt', 'File not found', ErrorCode.FILE_NOT_FOUND);

        expect(error).toBeInstanceOf(CodeYangError);
        expect(error).toBeInstanceOf(FileSystemError);
        expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
        expect(error.context.filePath).toBe('/test/file.txt');
      });

      it('should mark as non-recoverable', () => {
        const error = new FileSystemError('/test/file.txt', 'Permission denied', ErrorCode.FILE_PERMISSION_DENIED);

        expect(error.recoverable).toBe(false);
      });
    });

    describe('NetworkError', () => {
      it('should create network error', () => {
        const error = new NetworkError('Connection failed');

        expect(error).toBeInstanceOf(CodeYangError);
        expect(error).toBeInstanceOf(NetworkError);
        expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      });

      it('should mark as recoverable', () => {
        const error = new NetworkError('Connection timeout', ErrorCode.NETWORK_TIMEOUT);

        expect(error.recoverable).toBe(true);
      });
    });
  });

  describe('wrapError', () => {
    it('should return CodeYangError as is', () => {
      const originalError = new CodeYangError('Test error', ErrorCode.TOOL_EXECUTION_FAILED);
      const wrapped = wrapError(originalError);

      expect(wrapped).toBe(originalError);
    });

    it('should wrap generic Error as CodeYangError', () => {
      const error = new Error('Generic error');
      const wrapped = wrapError(error);

      expect(wrapped).toBeInstanceOf(CodeYangError);
      expect(wrapped.originalError).toBe(error);
    });

    it('should infer FILE_NOT_FOUND from ENOENT', () => {
      const error = new Error('ENOENT: no such file or directory');
      const wrapped = wrapError(error);

      expect(wrapped.code).toBe(ErrorCode.FILE_NOT_FOUND);
    });

    it('should infer PERMISSION_DENIED from EACCES', () => {
      const error = new Error('EACCES: permission denied');
      const wrapped = wrapError(error);

      expect(wrapped.code).toBe(ErrorCode.PERMISSION_DENIED);
    });

    it('should infer NETWORK_TIMEOUT from timeout message', () => {
      const error = new Error('Request timeout after 30s');
      const wrapped = wrapError(error);

      expect(wrapped.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    });

    it('should infer LLM_RATE_LIMIT from rate limit message', () => {
      const error = new Error('Rate limit exceeded (429)');
      const wrapped = wrapError(error);

      expect(wrapped.code).toBe(ErrorCode.LLM_RATE_LIMIT);
    });

    it('should infer NETWORK_CONNECTION_REFUSED from ECONNREFUSED', () => {
      const error = new Error('ECONNREFUSED: connection refused');
      const wrapped = wrapError(error);

      expect(wrapped.code).toBe(ErrorCode.NETWORK_CONNECTION_REFUSED);
    });

    it('should add context to wrapped error', () => {
      const error = new Error('Generic error');
      const wrapped = wrapError(error, { operation: 'readFile', tool: 'Read' });

      expect(wrapped.context.operation).toBe('readFile');
      expect(wrapped.context.tool).toBe('Read');
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable CodeYangError', () => {
      const error = new CodeYangError('Timeout', ErrorCode.LLM_TIMEOUT);

      expect(isRetryable(error)).toBe(true);
    });

    it('should return false for non-retryable CodeYangError', () => {
      const error = new CodeYangError('Invalid input', ErrorCode.INVALID_ARGUMENT);

      expect(isRetryable(error)).toBe(false);
    });

    it('should detect retryable patterns in generic errors', () => {
      const timeoutError = new Error('Request timeout');
      const rateLimitError = new Error('Rate limit exceeded');
      const serverError = new Error('503 Service Unavailable');

      expect(isRetryable(timeoutError)).toBe(true);
      expect(isRetryable(rateLimitError)).toBe(true);
      expect(isRetryable(serverError)).toBe(true);
    });

    it('should return false for generic non-retryable errors', () => {
      const error = new Error('Invalid input');

      expect(isRetryable(error)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should return delay from CodeYangError', () => {
      const error = new CodeYangError('Rate limited', ErrorCode.LLM_RATE_LIMIT);

      expect(getRetryDelay(error, 1)).toBe(5000); // 5s * 2^0
      expect(getRetryDelay(error, 2)).toBe(10000); // 5s * 2^1
      expect(getRetryDelay(error, 3)).toBe(20000); // 5s * 2^2
    });

    it('should use exponential backoff for generic errors', () => {
      const error = new Error('Timeout');

      expect(getRetryDelay(error, 1)).toBe(1000); // 1s * 2^0
      expect(getRetryDelay(error, 2)).toBe(2000); // 1s * 2^1
      expect(getRetryDelay(error, 3)).toBe(4000); // 1s * 2^2
    });
  });

  describe('Error Code Categories', () => {
    it('should have tool error codes', () => {
      expect(ErrorCode.TOOL_EXECUTION_FAILED).toBeDefined();
      expect(ErrorCode.TOOL_NOT_FOUND).toBeDefined();
      expect(ErrorCode.TOOL_TIMEOUT).toBeDefined();
    });

    it('should have LLM error codes', () => {
      expect(ErrorCode.LLM_API_ERROR).toBeDefined();
      expect(ErrorCode.LLM_RATE_LIMIT).toBeDefined();
      expect(ErrorCode.LLM_AUTH_FAILED).toBeDefined();
    });

    it('should have file system error codes', () => {
      expect(ErrorCode.FILE_NOT_FOUND).toBeDefined();
      expect(ErrorCode.FILE_PERMISSION_DENIED).toBeDefined();
    });

    it('should have network error codes', () => {
      expect(ErrorCode.NETWORK_ERROR).toBeDefined();
      expect(ErrorCode.NETWORK_TIMEOUT).toBeDefined();
    });
  });
});
