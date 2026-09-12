import { describe, it, expect } from 'vitest';
import {
  validateFilePath,
  sanitizeCommand,
  validateCommand,
  validateUrl,
  sanitizeInput,
  validateEmail,
  isAlphanumeric,
  validateGitRef,
  validatePort,
  validateEnvVarName,
  validateCacheKey,
  sanitizeLogMessage,
  redactSensitiveData,
} from './inputValidation.js';

describe('inputValidation', () => {
  describe('validateFilePath', () => {
    it('should accept valid absolute paths', () => {
      expect(validateFilePath('/home/user/project/file.ts')).toBe(true);
      expect(validateFilePath('C:\\Users\\John\\project\\file.ts')).toBe(true);
    });

    it('should reject relative paths', () => {
      expect(validateFilePath('./file.ts')).toBe(false);
      expect(validateFilePath('../file.ts')).toBe(false);
      expect(validateFilePath('file.ts')).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(validateFilePath('/home/user/../../etc/passwd')).toBe(false);
      expect(validateFilePath('/home/../../../etc/passwd')).toBe(false);
    });

    it('should reject dangerous system directories', () => {
      expect(validateFilePath('/etc/passwd')).toBe(false);
      expect(validateFilePath('/sys/kernel')).toBe(false);
      expect(validateFilePath('/proc/self')).toBe(false);
      expect(validateFilePath('C:\\Windows\\System32')).toBe(false);
    });

    it('should reject empty paths', () => {
      expect(validateFilePath('')).toBe(false);
      expect(validateFilePath('   ')).toBe(false);
    });

    it('should respect allowedRoot restriction', () => {
      expect(validateFilePath('/home/user/project/file.ts', '/home/user')).toBe(true);
      expect(validateFilePath('/home/other/file.ts', '/home/user')).toBe(false);
    });
  });

  describe('sanitizeCommand', () => {
    it('should remove dangerous shell characters', () => {
      expect(sanitizeCommand('echo test')).toBe('echo test');
      expect(sanitizeCommand('echo test; rm -rf /')).toBe('echo test rm -rf ');
      expect(sanitizeCommand('cat file | grep pattern')).toBe('cat file  grep pattern');
      expect(sanitizeCommand('$(malicious)')).toBe('malicious');
      expect(sanitizeCommand('`whoami`')).toBe('whoami');
    });

    it('should handle empty input', () => {
      expect(sanitizeCommand('')).toBe('');
    });

    it('should preserve safe characters', () => {
      expect(sanitizeCommand('command-name_123')).toBe('command-name_123');
      expect(sanitizeCommand('file.txt')).toBe('file.txt');
    });
  });

  describe('validateCommand', () => {
    it('should accept safe commands', () => {
      expect(validateCommand('ls -la')).toBe(true);
      expect(validateCommand('git status')).toBe(true);
    });

    it('should reject commands with dangerous characters', () => {
      expect(validateCommand('ls; rm -rf /')).toBe(false);
      expect(validateCommand('cat file | grep pattern')).toBe(false);
      expect(validateCommand('$(whoami)')).toBe(false);
      expect(validateCommand('`date`')).toBe(false);
    });

    it('should enforce whitelist when provided', () => {
      const whitelist = ['git', 'npm', 'node'];
      expect(validateCommand('git status', whitelist)).toBe(true);
      expect(validateCommand('npm install', whitelist)).toBe(true);
      expect(validateCommand('rm -rf /', whitelist)).toBe(false);
    });

    it('should reject empty commands', () => {
      expect(validateCommand('')).toBe(false);
      expect(validateCommand('   ')).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should accept valid HTTP/HTTPS URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://api.example.com/path')).toBe(true);
      expect(validateUrl('https://example.com:8080/path?query=value')).toBe(true);
    });

    it('should reject non-HTTP protocols', () => {
      expect(validateUrl('file:///etc/passwd')).toBe(false);
      expect(validateUrl('ftp://example.com')).toBe(false);
      expect(validateUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject localhost variants (SSRF protection)', () => {
      expect(validateUrl('http://localhost:8080')).toBe(false);
      expect(validateUrl('http://127.0.0.1')).toBe(false);
      expect(validateUrl('http://0.0.0.0')).toBe(false);
      expect(validateUrl('http://[::1]')).toBe(false);
    });

    it('should reject private IP ranges', () => {
      expect(validateUrl('http://10.0.0.1')).toBe(false);
      expect(validateUrl('http://172.16.0.1')).toBe(false);
      expect(validateUrl('http://192.168.1.1')).toBe(false);
      expect(validateUrl('http://169.254.1.1')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('not a url')).toBe(false);
      expect(validateUrl('')).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('should escape HTML characters', () => {
      expect(sanitizeInput('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
      expect(sanitizeInput('Hello "World"')).toBe('Hello &quot;World&quot;');
      expect(sanitizeInput("It's a test")).toBe('It&#x27;s a test');
    });

    it('should handle empty input', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user+tag@example.co.uk')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('not-an-email')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('isAlphanumeric', () => {
    it('should accept alphanumeric strings', () => {
      expect(isAlphanumeric('abc123')).toBe(true);
      expect(isAlphanumeric('Test123')).toBe(true);
    });

    it('should reject special characters by default', () => {
      expect(isAlphanumeric('hello-world')).toBe(false);
      expect(isAlphanumeric('hello world')).toBe(false);
    });

    it('should accept spaces when allowed', () => {
      expect(isAlphanumeric('hello world', true)).toBe(true);
    });

    it('should accept dashes when allowed', () => {
      expect(isAlphanumeric('hello-world', false, true)).toBe(true);
      expect(isAlphanumeric('hello_world', false, true)).toBe(true);
    });

    it('should reject empty strings', () => {
      expect(isAlphanumeric('')).toBe(false);
    });
  });

  describe('validateGitRef', () => {
    it('should accept valid branch names', () => {
      expect(validateGitRef('main')).toBe(true);
      expect(validateGitRef('feature/new-feature')).toBe(true);
      expect(validateGitRef('v1.0.0')).toBe(true);
    });

    it('should reject invalid git references', () => {
      expect(validateGitRef('.hidden')).toBe(false);
      expect(validateGitRef('branch.')).toBe(false);
      expect(validateGitRef('ref..name')).toBe(false);
      expect(validateGitRef('@')).toBe(false);
      expect(validateGitRef('branch.lock')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(validateGitRef('branch~1')).toBe(false);
      expect(validateGitRef('branch^1')).toBe(false);
      expect(validateGitRef('branch:name')).toBe(false);
      expect(validateGitRef('branch*')).toBe(false);
    });

    it('should reject empty references', () => {
      expect(validateGitRef('')).toBe(false);
      expect(validateGitRef('   ')).toBe(false);
    });
  });

  describe('validatePort', () => {
    it('should accept valid port numbers', () => {
      expect(validatePort(80)).toBe(true);
      expect(validatePort(443)).toBe(true);
      expect(validatePort(8080)).toBe(true);
      expect(validatePort('3000')).toBe(true);
    });

    it('should reject invalid port numbers', () => {
      expect(validatePort(0)).toBe(false);
      expect(validatePort(-1)).toBe(false);
      expect(validatePort(65536)).toBe(false);
      expect(validatePort(100000)).toBe(false);
    });

    it('should reject non-numeric strings', () => {
      expect(validatePort('abc')).toBe(false);
      expect(validatePort('80abc')).toBe(false);
    });
  });

  describe('validateEnvVarName', () => {
    it('should accept valid environment variable names', () => {
      expect(validateEnvVarName('PATH')).toBe(true);
      expect(validateEnvVarName('MY_VAR')).toBe(true);
      expect(validateEnvVarName('VAR_123')).toBe(true);
      expect(validateEnvVarName('_PRIVATE')).toBe(true);
    });

    it('should reject invalid environment variable names', () => {
      expect(validateEnvVarName('123VAR')).toBe(false);
      expect(validateEnvVarName('my-var')).toBe(false);
      expect(validateEnvVarName('my.var')).toBe(false);
      expect(validateEnvVarName('lowercase')).toBe(false);
    });

    it('should reject empty names', () => {
      expect(validateEnvVarName('')).toBe(false);
    });
  });

  describe('validateCacheKey', () => {
    it('should accept valid cache keys', () => {
      expect(validateCacheKey('user:123')).toBe(true);
      expect(validateCacheKey('cache.key-name_123')).toBe(true);
    });

    it('should reject keys with invalid characters', () => {
      expect(validateCacheKey('key with spaces')).toBe(false);
      expect(validateCacheKey('key@special')).toBe(false);
      expect(validateCacheKey('key/path')).toBe(false);
    });

    it('should reject empty keys', () => {
      expect(validateCacheKey('')).toBe(false);
    });

    it('should reject excessively long keys', () => {
      const longKey = 'a'.repeat(300);
      expect(validateCacheKey(longKey)).toBe(false);
    });
  });

  describe('sanitizeLogMessage', () => {
    it('should escape newlines and special characters', () => {
      expect(sanitizeLogMessage('Line 1\nLine 2')).toBe('Line 1\\nLine 2');
      expect(sanitizeLogMessage('Col 1\tCol 2')).toBe('Col 1\\tCol 2');
      expect(sanitizeLogMessage('Line 1\r\nLine 2')).toBe('Line 1\\r\\nLine 2');
    });

    it('should handle empty input', () => {
      expect(sanitizeLogMessage('')).toBe('');
    });
  });

  describe('redactSensitiveData', () => {
    it('should redact sensitive keys', () => {
      const obj = {
        username: 'john',
        password: 'secret123',
        apiKey: 'sk-123456',
      };

      const redacted = redactSensitiveData(obj);
      expect(redacted.username).toBe('john');
      expect(redacted.password).toBe('***REDACTED***');
      expect(redacted.apiKey).toBe('***REDACTED***');
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          name: 'john',
          credentials: {
            password: 'secret',
            token: 'abc123',
          },
        },
      };

      const redacted = redactSensitiveData(obj);
      expect(redacted.user.name).toBe('john');
      expect(redacted.user.credentials.password).toBe('***REDACTED***');
      expect(redacted.user.credentials.token).toBe('***REDACTED***');
    });

    it('should handle arrays', () => {
      const arr = [
        { name: 'user1', password: 'pass1' },
        { name: 'user2', token: 'token2' },
      ];

      const redacted = redactSensitiveData(arr);
      expect(redacted[0].name).toBe('user1');
      expect(redacted[0].password).toBe('***REDACTED***');
      expect(redacted[1].token).toBe('***REDACTED***');
    });

    it('should handle non-objects', () => {
      expect(redactSensitiveData('string')).toBe('string');
      expect(redactSensitiveData(123)).toBe(123);
      expect(redactSensitiveData(null)).toBe(null);
    });
  });
});
