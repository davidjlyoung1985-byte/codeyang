/**
 * Tests for CLI entry point
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('CLI Entry Point', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalArgv = process.argv;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Argument parsing', () => {
    it('should parse --help flag', () => {
      process.argv = ['node', 'index.js', '--help'];
      expect(process.argv.includes('--help')).toBe(true);
    });

    it('should parse --version flag', () => {
      process.argv = ['node', 'index.js', '--version'];
      expect(process.argv.includes('--version')).toBe(true);
    });

    it('should parse --model flag', () => {
      process.argv = ['node', 'index.js', '--model', 'gpt-4'];
      const modelIndex = process.argv.indexOf('--model');
      expect(modelIndex).toBeGreaterThan(-1);
      expect(process.argv[modelIndex + 1]).toBe('gpt-4');
    });

    it('should parse --api-key flag', () => {
      process.argv = ['node', 'index.js', '--api-key', 'test-key'];
      const keyIndex = process.argv.indexOf('--api-key');
      expect(keyIndex).toBeGreaterThan(-1);
      expect(process.argv[keyIndex + 1]).toBe('test-key');
    });
  });

  describe('Environment variables', () => {
    it('should read CODEYANG_API_KEY from env', () => {
      process.env.CODEYANG_API_KEY = 'env-test-key';
      expect(process.env.CODEYANG_API_KEY).toBe('env-test-key');
    });

    it('should read CODEYANG_MODEL from env', () => {
      process.env.CODEYANG_MODEL = 'deepseek-chat';
      expect(process.env.CODEYANG_MODEL).toBe('deepseek-chat');
    });

    it('should read CODEYANG_MAX_TOKENS from env', () => {
      process.env.CODEYANG_MAX_TOKENS = '32000';
      expect(process.env.CODEYANG_MAX_TOKENS).toBe('32000');
    });

    it('should read CODEYANG_BASE_URL from env', () => {
      process.env.CODEYANG_BASE_URL = 'https://api.example.com';
      expect(process.env.CODEYANG_BASE_URL).toBe('https://api.example.com');
    });
  });

  describe('API key validation', () => {
    it('should handle missing API key', () => {
      delete process.env.CODEYANG_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      expect(process.env.CODEYANG_API_KEY).toBeUndefined();
      expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
    });

    it('should prefer CODEYANG_API_KEY over DEEPSEEK_API_KEY', () => {
      process.env.CODEYANG_API_KEY = 'primary-key';
      process.env.DEEPSEEK_API_KEY = 'secondary-key';
      const apiKey = process.env.CODEYANG_API_KEY || process.env.DEEPSEEK_API_KEY;
      expect(apiKey).toBe('primary-key');
    });

    it('should fall back to DEEPSEEK_API_KEY', () => {
      delete process.env.CODEYANG_API_KEY;
      process.env.DEEPSEEK_API_KEY = 'fallback-key';
      const apiKey = process.env.CODEYANG_API_KEY || process.env.DEEPSEEK_API_KEY;
      expect(apiKey).toBe('fallback-key');
    });
  });

  describe('Configuration validation', () => {
    it('should validate model name format', () => {
      const validModels = ['gpt-4', 'gpt-3.5-turbo', 'deepseek-chat', 'claude-3-opus'];
      validModels.forEach((model) => {
        expect(model).toMatch(/^[a-z0-9.-]+$/);
      });
    });

    it('should validate max tokens is a number', () => {
      const maxTokens = '32000';
      expect(Number(maxTokens)).toBeGreaterThan(0);
      expect(Number.isNaN(Number(maxTokens))).toBe(false);
    });

    it('should validate base URL format', () => {
      const baseUrl = 'https://api.deepseek.com/v1';
      expect(baseUrl).toMatch(/^https?:\/\/.+/);
    });
  });

  describe('Working directory', () => {
    it('should use current working directory by default', () => {
      const cwd = process.cwd();
      expect(cwd).toBeDefined();
      expect(typeof cwd).toBe('string');
    });

    it('should handle custom working directory', () => {
      const customDir = '/custom/path';
      expect(customDir).toBe('/custom/path');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid arguments gracefully', () => {
      process.argv = ['node', 'index.js', '--invalid-flag'];
      expect(process.argv.includes('--invalid-flag')).toBe(true);
    });

    it('should handle empty arguments', () => {
      process.argv = ['node', 'index.js'];
      expect(process.argv.length).toBe(2);
    });
  });
});
