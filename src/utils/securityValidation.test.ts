import { describe, it, expect } from 'vitest';
import {
  validatePath,
  validateCommand,
  validateUrl,
  isPathTraversal,
  isSafeCommand,
  isPrivateIP,
  sanitizeShellArg,
  SecurityError,
} from './securityValidation.js';

describe('Security Validation', () => {
  describe('Path Validation', () => {
    it('should allow valid paths', () => {
      expect(() => validatePath('/home/user/file.txt')).not.toThrow();
      expect(() => validatePath('C:\\Users\\test\\file.txt')).not.toThrow();
      expect(() => validatePath('./relative/path.txt')).not.toThrow();
    });

    it('should block path traversal attempts', () => {
      expect(() => validatePath('../../../etc/passwd')).toThrow(SecurityError);
      expect(() => validatePath('..\\..\\windows\\system32')).toThrow(SecurityError);
      expect(() => validatePath('/path/../../../etc/shadow')).toThrow(SecurityError);
    });

    it('should detect path traversal patterns', () => {
      expect(isPathTraversal('../file.txt')).toBe(true);
      expect(isPathTraversal('..\\file.txt')).toBe(true);
      expect(isPathTraversal('/path/../../etc/passwd')).toBe(true);
      expect(isPathTraversal('./normal/path.txt')).toBe(false);
    });

    it('should handle encoded path traversal', () => {
      expect(() => validatePath('%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toThrow(SecurityError);
      expect(() => validatePath('..%2F..%2Fetc%2Fpasswd')).toThrow(SecurityError);
    });

    it('should handle null bytes', () => {
      expect(() => validatePath('/path/file\0.txt')).toThrow(SecurityError);
      expect(() => validatePath('/path\x00/file.txt')).toThrow(SecurityError);
    });
  });

  describe('Command Validation', () => {
    it('should allow safe commands', () => {
      expect(() => validateCommand('ls -la')).not.toThrow();
      expect(() => validateCommand('git status')).not.toThrow();
      expect(() => validateCommand('npm test')).not.toThrow();
    });

    it('should block command injection', () => {
      expect(() => validateCommand('ls; rm -rf /')).toThrow(SecurityError);
      expect(() => validateCommand('cmd | malicious')).toThrow(SecurityError);
      expect(() => validateCommand('test && evil')).toThrow(SecurityError);
      expect(() => validateCommand('echo `whoami`')).toThrow(SecurityError);
      expect(() => validateCommand('echo $(rm -rf)')).toThrow(SecurityError);
    });

    it('should detect unsafe command patterns', () => {
      expect(isSafeCommand('ls -la')).toBe(true);
      expect(isSafeCommand('ls; rm -rf')).toBe(false);
      expect(isSafeCommand('test | grep')).toBe(false);
      expect(isSafeCommand('cmd && evil')).toBe(false);
      expect(isSafeCommand('echo `whoami`')).toBe(false);
    });

    it('should sanitize shell arguments', () => {
      expect(sanitizeShellArg('normal')).toBe('normal');
      expect(sanitizeShellArg('with space')).toBe('"with space"');
      expect(sanitizeShellArg('with"quote')).toBe('"with\\"quote"');
      expect(sanitizeShellArg('with;semicolon')).toContain(';');
    });
  });

  describe('URL Validation', () => {
    it('should allow valid public URLs', () => {
      expect(() => validateUrl('https://example.com')).not.toThrow();
      expect(() => validateUrl('http://api.github.com')).not.toThrow();
      expect(() => validateUrl('https://8.8.8.8')).not.toThrow();
    });

    it('should block private IPs (SSRF)', () => {
      expect(() => validateUrl('http://127.0.0.1')).toThrow(SecurityError);
      expect(() => validateUrl('http://localhost')).toThrow(SecurityError);
      expect(() => validateUrl('http://192.168.1.1')).toThrow(SecurityError);
      expect(() => validateUrl('http://10.0.0.1')).toThrow(SecurityError);
      expect(() => validateUrl('http://172.16.0.1')).toThrow(SecurityError);
      expect(() => validateUrl('http://169.254.1.1')).toThrow(SecurityError);
    });

    it('should detect private IP ranges', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('192.168.1.1')).toBe(true);
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('169.254.1.1')).toBe(true);
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('1.1.1.1')).toBe(false);
    });

    it('should block invalid URL schemes', () => {
      expect(() => validateUrl('file:///etc/passwd')).toThrow(SecurityError);
      expect(() => validateUrl('ftp://example.com')).toThrow(SecurityError);
      expect(() => validateUrl('javascript:alert(1)')).toThrow(SecurityError);
    });

    it('should block localhost variations', () => {
      expect(() => validateUrl('http://localhost:8080')).toThrow(SecurityError);
      expect(() => validateUrl('http://0.0.0.0')).toThrow(SecurityError);
      expect(() => validateUrl('http://[::1]')).toThrow(SecurityError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty inputs', () => {
      expect(() => validatePath('')).toThrow();
      expect(() => validateCommand('')).toThrow();
      expect(() => validateUrl('')).toThrow();
    });

    it('should handle very long inputs', () => {
      const longPath = 'a'.repeat(10000);
      expect(() => validatePath(longPath)).toThrow();

      const longCommand = 'echo ' + 'a'.repeat(10000);
      expect(() => validateCommand(longCommand)).toThrow();
    });

    it('should handle special characters', () => {
      expect(() => validatePath('/path/with\nnewline')).toThrow();
      expect(() => validateCommand('cmd\rwith\rcarriage')).toThrow();
    });
  });
});
