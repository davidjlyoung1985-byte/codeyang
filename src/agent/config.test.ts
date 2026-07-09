import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  config,
  validateConfig,
  saveApiSettings,
  getMcpServers,
  saveMcpServers,
  getLocalConfigApiKey,
  setSessionApiKey,
  getConfigVersion,
  loadLocalConfig,
} from './config.js';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars
    delete process.env.CODEYANG_MODEL;
    delete process.env.CODEYANG_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.CODEYANG_BASE_URL;
    delete process.env.CODEYANG_MAX_TOKENS;
    delete process.env.CODEYANG_MAX_TURNS;
    delete process.env.CODEYANG_AUTO_VERIFY;
    delete process.env.CODEYANG_AUTO_FIX;
    delete process.env.CODEYANG_WATCH;
    delete process.env.CODEYANG_CWD;
    delete process.env.CODEYANG_MAX_RETRIES;
    delete process.env.CODEYANG_REFLEXION;
    delete process.env.CODEYANG_PLANNER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('model', () => {
    it('has a default model', () => {
      expect(config.model).toBeTruthy();
      expect(typeof config.model).toBe('string');
    });

    it('defaults to deepseek-chat model', () => {
      expect(config.model).toBe('deepseek-chat');
    });

    it('can be overridden via setter', () => {
      const original = config.model;
      config.model = 'custom-model';
      expect(config.model).toBe('custom-model');
      config.model = original;
    });
  });

  describe('apiKey', () => {
    it('returns empty string when no key is set', () => {
      expect(typeof config.apiKey).toBe('string');
    });

    it('respects CODEYANG_API_KEY env var', () => {
      process.env.CODEYANG_API_KEY = 'test-key-123';
      expect(config.apiKey).toBe('test-key-123');
    });

    it('respects DEEPSEEK_API_KEY env var', () => {
      process.env.DEEPSEEK_API_KEY = 'deepseek-key';
      expect(config.apiKey).toBe('deepseek-key');
    });

    it('prefers CODEYANG_API_KEY over DEEPSEEK_API_KEY', () => {
      process.env.CODEYANG_API_KEY = 'primary';
      process.env.DEEPSEEK_API_KEY = 'fallback';
      expect(config.apiKey).toBe('primary');
    });
  });

  describe('baseURL', () => {
    it('has a default baseURL', () => {
      expect(config.baseURL).toBeTruthy();
      expect(typeof config.baseURL).toBe('string');
    });

    it('defaults to DeepSeek Anthropic endpoint', () => {
      expect(config.baseURL).toBe('https://api.deepseek.com/anthropic');
    });

    it('respects CODEYANG_BASE_URL env var', () => {
      process.env.CODEYANG_BASE_URL = 'https://custom.api.com';
      expect(config.baseURL).toBe('https://custom.api.com');
    });
  });

  describe('provider', () => {
    it('defaults to deepseek', () => {
      expect(config.provider).toBe('deepseek');
    });
  });

  describe('maxTokens', () => {
    it('has a sensible default maxTokens', () => {
      expect(config.maxTokens).toBeGreaterThan(0);
      expect(typeof config.maxTokens).toBe('number');
    });

    it('defaults to 1000000', () => {
      expect(config.maxTokens).toBe(1000000);
    });

    it('respects CODEYANG_MAX_TOKENS env var', () => {
      process.env.CODEYANG_MAX_TOKENS = '8192';
      expect(config.maxTokens).toBe(8192);
    });

    it('falls back to default on invalid number', () => {
      process.env.CODEYANG_MAX_TOKENS = 'invalid';
      expect(config.maxTokens).toBe(1000000);
    });
  });

  describe('maxTurns', () => {
    it('defaults to 40', () => {
      expect(config.maxTurns).toBe(40);
    });
  });

  describe('boolean flags', () => {
    it('autoVerify defaults to true', () => {
      expect(config.autoVerify).toBe(true);
    });

    it('autoFixOnError defaults to true', () => {
      expect(config.autoFixOnError).toBe(true);
    });

    it('watchMode defaults to true', () => {
      expect(config.watchMode).toBe(true);
    });
  });

  describe('cwd', () => {
    it('defaults to process.cwd()', () => {
      expect(config.cwd).toBe(process.cwd());
    });

    it('respects CODEYANG_CWD env var', () => {
      process.env.CODEYANG_CWD = '/custom/path';
      expect(config.cwd).toBe('/custom/path');
    });
  });

  describe('maxRetries', () => {
    it('defaults to 3', () => {
      expect(config.maxRetries).toBe(3);
    });

    it('respects CODEYANG_MAX_RETRIES env var', () => {
      process.env.CODEYANG_MAX_RETRIES = '5';
      expect(config.maxRetries).toBe(5);
    });

    it('falls back to 3 on invalid number', () => {
      process.env.CODEYANG_MAX_RETRIES = 'bad';
      expect(config.maxRetries).toBe(3);
    });
  });

  describe('reflexion config', () => {
    it('has reflexion enabled by default', () => {
      expect(config.reflexion.enabled).toBe(true);
    });

    it('has default failureThreshold of 2', () => {
      expect(config.reflexion.failureThreshold).toBe(2);
    });

    it('has default maxReflections of 50', () => {
      expect(config.reflexion.maxReflections).toBe(50);
    });

    it('has autoInject enabled by default', () => {
      expect(config.reflexion.autoInject).toBe(true);
    });
  });

  describe('planner config', () => {
    it('has planner enabled by default', () => {
      expect(config.planner.enabled).toBe(true);
    });

    it('has autoDetect enabled by default', () => {
      expect(config.planner.autoDetect).toBe(true);
    });

    it('has default complexityThreshold of 3', () => {
      expect(config.planner.complexityThreshold).toBe(3);
    });

    it('has requireApproval enabled by default', () => {
      expect(config.planner.requireApproval).toBe(true);
    });

    it('has default maxRetries of 2', () => {
      expect(config.planner.maxRetries).toBe(2);
    });
  });

  describe('getSystemPrompt', () => {
    it('returns a non-empty string', () => {
      const prompt = config.getSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes Qt context when provided', () => {
      const qtContext = {
        isQtProject: true,
        qtVersion: '6.5.0',
        buildSystem: 'cmake' as const,
        modules: ['Core', 'Widgets'],
      };
      const prompt = config.getSystemPrompt(qtContext);
      expect(prompt).toContain('Qt');
    });
  });

  describe('validateConfig', () => {
    it('returns empty array for valid config', () => {
      const errors = validateConfig();
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe('session management', () => {
    it('setSessionApiKey updates session key', () => {
      setSessionApiKey('session-key');
      expect(config.apiKey).toBe('session-key');
    });

    it('getConfigVersion returns a number', () => {
      const version = getConfigVersion();
      expect(typeof version).toBe('number');
      expect(version).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MCP servers', () => {
    it('getMcpServers returns an object', () => {
      const servers = getMcpServers();
      expect(typeof servers).toBe('object');
    });
  });
});
