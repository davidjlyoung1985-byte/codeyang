import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkConfigPermissions, validateApiKey } from './configSecurity.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('configSecurity', () => {
  let testDir: string;
  let testConfigPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `codeyang-config-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    testConfigPath = join(testDir, 'config.json');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('validateApiKey', () => {
    it('accepts valid API keys', () => {
      expect(validateApiKey('sk-1234567890abcdef1234').valid).toBe(true);
      expect(validateApiKey('deepseek-r-abcdef1234567890').valid).toBe(true);
      expect(validateApiKey('anthropic-key-123456789').valid).toBe(true);
    });

    it('rejects placeholder keys', () => {
      const result1 = validateApiKey('your-key-here');
      expect(result1.valid).toBe(false);
      expect(result1.warning).toContain('example');
    });

    it('rejects short keys', () => {
      const result1 = validateApiKey('sk-123');
      expect(result1.valid).toBe(false);
      expect(result1.warning).toContain('too short');

      const result2 = validateApiKey('short');
      expect(result2.valid).toBe(false);
      expect(result2.warning).toContain('too short');
    });

    it('rejects empty keys', () => {
      const result = validateApiKey('');
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('too short');
    });

    it('rejects truncated/redacted keys', () => {
      const result1 = validateApiKey('sk-1234567890abcdef...');
      expect(result1.valid).toBe(false);
      expect(result1.warning).toContain('truncated');

      const result2 = validateApiKey('sk-************1234567890');
      expect(result2.valid).toBe(false);
      expect(result2.warning).toContain('redacted');
    });

    it('rejects keys with whitespace', () => {
      const result = validateApiKey(' sk-12345678901234567890 ');
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('whitespace');
    });
  });

  describe('checkConfigPermissions', () => {
    it('returns without error when config file does not exist', async () => {
      // Should not throw for non-existent file
      await expect(checkConfigPermissions('/nonexistent/config.json')).resolves.toBeUndefined();
    });

    it('checks permissions on existing file', async () => {
      await writeFile(testConfigPath, JSON.stringify({ apiKey: 'test' }));

      // Should complete without throwing
      await expect(checkConfigPermissions(testConfigPath)).resolves.toBeUndefined();
    });

    it('handles permission check errors gracefully', async () => {
      const invalidPath = join(testDir, 'invalid', 'deeply', 'nested', 'config.json');

      // Should not throw even for invalid paths
      await expect(checkConfigPermissions(invalidPath)).resolves.toBeUndefined();
    });
  });
});
