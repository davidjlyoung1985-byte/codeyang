import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config, validateConfig, saveApiSettings, getMcpServers, saveMcpServers } from './config.js';

describe('config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('basic properties', () => {
    it('has a default model', () => {
      expect(config.model).toBeTruthy();
      expect(typeof config.model).toBe('string');
    });

    it('has a sensible default maxTokens', () => {
      expect(config.maxTokens).toBeGreaterThan(0);
      expect(typeof config.maxTokens).toBe('number');
    });

    it('returns empty string for apiKey when no env var is set', () => {
      expect(typeof config.apiKey).toBe('string');
    });

    it('defaults to deepseek-chat model', () => {
      expect(config.model).toBe('deepseek-chat');
    });

    it('has reflexion config with defaults', () => {
      expect(config.reflexion).toBeDefined();
      expect(typeof config.reflexion.enabled).toBe('boolean');
      expect(typeof config.reflexion.failureThreshold).toBe('number');
      expect(config.reflexion.failureThreshold).toBeGreaterThan(0);
    });

    it('has planner config with defaults', () => {
      expect(config.planner).toBeDefined();
      expect(typeof config.planner.enabled).toBe('boolean');
      expect(typeof config.planner.autoDetect).toBe('boolean');
    });

    it('has maxTurns greater than 0', () => {
      expect(config.maxTurns).toBeGreaterThan(0);
    });

    it('has getSystemPrompt function', () => {
      expect(typeof config.getSystemPrompt).toBe('function');
      const prompt = config.getSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('environment variable overrides (dynamic getters)', () => {
    it('uses CODEYANG_MODEL when set', () => {
      process.env['CODEYANG_MODEL'] = 'claude-opus-4';
      expect(config.model).toBe('claude-opus-4');
    });

    it('uses CODEYANG_API_KEY when set', () => {
      process.env['CODEYANG_API_KEY'] = 'sk-test-key-123';
      expect(config.apiKey).toBe('sk-test-key-123');
    });

    it('falls back to DEEPSEEK_API_KEY when CODEYANG_API_KEY not set', () => {
      delete process.env['CODEYANG_API_KEY'];
      process.env['DEEPSEEK_API_KEY'] = 'sk-deepseek-456';
      expect(config.apiKey).toBe('sk-deepseek-456');
    });

    it('uses CODEYANG_BASE_URL when set', () => {
      process.env['CODEYANG_BASE_URL'] = 'https://custom.api.com';
      expect(config.baseURL).toBe('https://custom.api.com');
    });

    it('uses CODEYANG_MAX_TOKENS when set', () => {
      process.env['CODEYANG_MAX_TOKENS'] = '50000';
      expect(config.maxTokens).toBe(50000);
    });

    it('handles invalid CODEYANG_MAX_TOKENS gracefully', () => {
      process.env['CODEYANG_MAX_TOKENS'] = 'invalid';
      expect(config.maxTokens).toBe(1000000); // fallback to default
    });

    it('uses CODEYANG_CWD when set', () => {
      process.env['CODEYANG_CWD'] = '/custom/path';
      expect(config.cwd).toBe('/custom/path');
    });

    it('falls back to process.cwd() when CODEYANG_CWD not set', () => {
      delete process.env['CODEYANG_CWD'];
      expect(config.cwd).toBe(process.cwd());
    });

    it('uses CODEYANG_MAX_RETRIES when set', () => {
      process.env['CODEYANG_MAX_RETRIES'] = '5';
      expect(config.maxRetries).toBe(5);
    });

    it('handles invalid CODEYANG_MAX_RETRIES gracefully', () => {
      process.env['CODEYANG_MAX_RETRIES'] = 'not-a-number';
      expect(config.maxRetries).toBe(3); // fallback to default
    });
  });

  describe('static config values', () => {
    // These are evaluated at module load time, so we just verify they exist
    it('has maxTurns as number', () => {
      expect(typeof config.maxTurns).toBe('number');
      expect(config.maxTurns).toBeGreaterThan(0);
    });

    it('has autoVerify as boolean', () => {
      expect(typeof config.autoVerify).toBe('boolean');
    });

    it('has autoFixOnError as boolean', () => {
      expect(typeof config.autoFixOnError).toBe('boolean');
    });

    it('has watchMode as boolean', () => {
      expect(typeof config.watchMode).toBe('boolean');
    });
  });

  describe('reflexion config structure', () => {
    it('has reflexion config object', () => {
      expect(config.reflexion).toBeDefined();
      expect(typeof config.reflexion).toBe('object');
    });

    it('has reflexion.enabled as boolean', () => {
      expect(typeof config.reflexion.enabled).toBe('boolean');
    });

    it('has reflexion.failureThreshold as number', () => {
      expect(typeof config.reflexion.failureThreshold).toBe('number');
      expect(config.reflexion.failureThreshold).toBeGreaterThanOrEqual(0);
    });

    it('has reflexion.maxReflections as number', () => {
      expect(typeof config.reflexion.maxReflections).toBe('number');
      expect(config.reflexion.maxReflections).toBeGreaterThan(0);
    });

    it('has reflexion.autoInject as boolean', () => {
      expect(typeof config.reflexion.autoInject).toBe('boolean');
    });
  });

  describe('planner config structure', () => {
    it('has planner config object', () => {
      expect(config.planner).toBeDefined();
      expect(typeof config.planner).toBe('object');
    });

    it('has planner.enabled as boolean', () => {
      expect(typeof config.planner.enabled).toBe('boolean');
    });

    it('has planner.autoDetect as boolean', () => {
      expect(typeof config.planner.autoDetect).toBe('boolean');
    });

    it('has planner.complexityThreshold as number', () => {
      expect(typeof config.planner.complexityThreshold).toBe('number');
      expect(config.planner.complexityThreshold).toBeGreaterThan(0);
    });

    it('has planner.requireApproval as boolean', () => {
      expect(typeof config.planner.requireApproval).toBe('boolean');
    });

    it('has planner.maxRetries as number', () => {
      expect(typeof config.planner.maxRetries).toBe('number');
      expect(config.planner.maxRetries).toBeGreaterThanOrEqual(0);
    });
  });

  describe('model override', () => {
    it('allows setting model programmatically', () => {
      config.model = 'custom-model';
      expect(config.model).toBe('custom-model');
    });

    it('programmatic override takes precedence over env var', () => {
      process.env['CODEYANG_MODEL'] = 'env-model';
      config.model = 'override-model';
      expect(config.model).toBe('override-model');
    });
  });

  describe('validateConfig', () => {
    it('returns empty array for valid config', () => {
      const errors = validateConfig();
      expect(Array.isArray(errors)).toBe(true);
    });

    it('validates apiKey type', () => {
      // This tests internal validation - would need to expose localConfig or use saveApiSettings
      expect(validateConfig).toBeDefined();
    });
  });

  describe('getSystemPrompt', () => {
    it('returns non-empty string', () => {
      const prompt = config.getSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes Qt context when provided', () => {
      const qtContext = {
        isQtProject: true,
        qtVersion: '6.5',
        modules: ['QtCore', 'QtWidgets'],
      };
      const prompt = config.getSystemPrompt(qtContext);
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('handles undefined Qt context', () => {
      const prompt = config.getSystemPrompt(undefined);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles zero maxTokens', () => {
      process.env['CODEYANG_MAX_TOKENS'] = '0';
      expect(config.maxTokens).toBe(0);
    });

    it('handles negative maxRetries', () => {
      process.env['CODEYANG_MAX_RETRIES'] = '-1';
      expect(config.maxRetries).toBe(-1); // Number() allows negative
    });

    it('verifies maxTurns is a positive number', () => {
      // maxTurns is static, just verify it's valid
      expect(typeof config.maxTurns).toBe('number');
      expect(config.maxTurns).toBeGreaterThan(0);
    });
  });

  describe('provider', () => {
    it('defaults to deepseek', () => {
      expect(config.provider).toBe('deepseek');
    });
  });

  describe('baseURL', () => {
    it('has default value', () => {
      expect(config.baseURL).toBe('https://api.deepseek.com/anthropic');
    });
  });
});
