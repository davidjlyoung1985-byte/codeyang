import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Import internal parse function via the module
import { loadEnvFiles } from './dotenv.js';

// We need to access parseDotEnv directly — load it as a private API
// by reading exports or duplicating the logic for testing.

describe('dotenv', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `codeyang-test-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test files
    for (const name of ['.env', '.env.local']) {
      const p = join(tmpDir, name);
      if (existsSync(p)) unlinkSync(p);
    }
    if (existsSync(tmpDir)) {
      try { unlinkSync(tmpDir); } catch { /* ignore */ }
    }
  });

  function writeEnv(name: string, content: string) {
    writeFileSync(join(tmpDir, name), content, 'utf-8');
  }

  describe('loadEnvFiles', () => {
    it('loads variables from .env', () => {
      writeEnv('.env', 'MY_KEY=abc123');
      loadEnvFiles(tmpDir);
      expect(process.env['MY_KEY']).toBe('abc123');
      delete process.env['MY_KEY'];
    });

    it('loads .env.local after .env (local overrides)', () => {
      writeEnv('.env', 'SHARED=from-env\nLOCAL_VAL=from-env');
      writeEnv('.env.local', 'LOCAL_VAL=from-local');

      loadEnvFiles(tmpDir);
      expect(process.env['SHARED']).toBe('from-env');
      expect(process.env['LOCAL_VAL']).toBe('from-local');
      delete process.env['SHARED'];
      delete process.env['LOCAL_VAL'];
    });

    it('does NOT override existing process.env values', () => {
      process.env['EXISTING'] = 'original';
      writeEnv('.env', 'EXISTING=overwrite');

      loadEnvFiles(tmpDir);
      expect(process.env['EXISTING']).toBe('original');
      delete process.env['EXISTING'];
    });

    it('handles quoted values', () => {
      writeEnv('.env', 'KEY="quoted value"\nKEY2=\'single quoted\'');
      loadEnvFiles(tmpDir);
      expect(process.env['KEY']).toBe('quoted value');
      expect(process.env['KEY2']).toBe('single quoted');
      delete process.env['KEY'];
      delete process.env['KEY2'];
    });

    it('skips comments and empty lines', () => {
      writeEnv('.env', '# comment\n\nKEY=value\n# another comment');
      loadEnvFiles(tmpDir);
      expect(process.env['KEY']).toBe('value');
      delete process.env['KEY'];
    });

    it('loads values with = in them', () => {
      writeEnv('.env', 'SECRET=base64==data');
      loadEnvFiles(tmpDir);
      expect(process.env['SECRET']).toBe('base64==data');
      delete process.env['SECRET'];
    });

    it('handles values with spaces (unquoted)', () => {
      writeEnv('.env', 'KEY=value with spaces');
      loadEnvFiles(tmpDir);
      expect(process.env['KEY']).toBe('value with spaces');
      delete process.env['KEY'];
    });

    it('silently ignores missing files', () => {
      // No files written — should not throw
      expect(() => loadEnvFiles(tmpDir)).not.toThrow();
    });

    it('handles trailing whitespace in keys and values', () => {
      writeEnv('.env', '  KEY  =  value  ');
      loadEnvFiles(tmpDir);
      expect(process.env['KEY']).toBe('value');
      delete process.env['KEY'];
    });
  });
});
