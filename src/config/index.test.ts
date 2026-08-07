import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getConfig, reloadConfig, setConfig, clearConfigCache } from './index.js';

describe('Configuration Management', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    clearConfigCache();
  });

  it('should load default configuration', () => {
    process.env.CODEYANG_API_KEY = 'test-key';

    const config = loadConfig();

    expect(config.apiKey).toBe('test-key');
    expect(config.provider).toBe('deepseek');
    expect(config.model).toBe('deepseek-chat');
    expect(config.maxTokens).toBe(32000);
    expect(config.streamTimeout).toBe(300000);
    expect(config.bashTimeout).toBe(60000);
    expect(config.debug).toBe(false);
  });

  it('should load custom configuration from environment', () => {
    process.env.CODEYANG_API_KEY = 'custom-key';
    process.env.CODEYANG_PROVIDER = 'anthropic';
    process.env.CODEYANG_MODEL = 'claude-3-opus';
    process.env.CODEYANG_MAX_TOKENS = '8000';
    process.env.CODEYANG_DEBUG = 'true';
    process.env.CODEYANG_DEBUG_FILTER = 'tool,agent';

    const config = loadConfig();

    expect(config.apiKey).toBe('custom-key');
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-3-opus');
    expect(config.maxTokens).toBe(8000);
    expect(config.debug).toBe(true);
    expect(config.debugFilter).toEqual(['tool', 'agent']);
  });

  it('should validate required fields', () => {
    delete process.env.CODEYANG_API_KEY;

    expect(() => loadConfig()).toThrow(/CODEYANG_API_KEY is required/i);
  });

  it('should validate provider enum', () => {
    process.env.CODEYANG_API_KEY = 'test-key';
    process.env.CODEYANG_PROVIDER = 'invalid';

    expect(() => loadConfig()).toThrow(/Invalid provider/i);
  });

  it('should validate positive numbers', () => {
    process.env.CODEYANG_API_KEY = 'test-key';
    process.env.CODEYANG_MAX_TOKENS = '-1';

    expect(() => loadConfig()).toThrow(/maxTokens must be positive/i);
  });

  it('should cache configuration', () => {
    process.env.CODEYANG_API_KEY = 'test-key';

    const config1 = getConfig();
    process.env.CODEYANG_API_KEY = 'changed-key';
    const config2 = getConfig();

    expect(config1).toBe(config2); // Same reference
    expect(config2.apiKey).toBe('test-key'); // Not changed
  });

  it('should reload configuration on demand', () => {
    process.env.CODEYANG_API_KEY = 'test-key';

    const config1 = getConfig();

    process.env.CODEYANG_API_KEY = 'changed-key';
    const config2 = reloadConfig();

    expect(config1).not.toBe(config2);
    expect(config2.apiKey).toBe('changed-key');
  });

  it('should allow partial config updates for testing', () => {
    process.env.CODEYANG_API_KEY = 'test-key';

    getConfig();
    setConfig({ maxTokens: 16000 });

    const config = getConfig();
    expect(config.maxTokens).toBe(16000);
    expect(config.apiKey).toBe('test-key'); // Unchanged
  });

  it('should parse circuit breaker config', () => {
    process.env.CODEYANG_API_KEY = 'test-key';
    process.env.CODEYANG_CB_THRESHOLD = '10';
    process.env.CODEYANG_CB_RATE = '0.75';

    const config = loadConfig();

    expect(config.circuitBreaker.threshold).toBe(10);
    expect(config.circuitBreaker.rate).toBe(0.75);
  });

  it('should validate circuit breaker rate range', () => {
    process.env.CODEYANG_API_KEY = 'test-key';
    process.env.CODEYANG_CB_RATE = '1.5';

    expect(() => loadConfig()).toThrow(/rate must be between 0 and 1/i);
  });

  it('should handle invalid number formats', () => {
    process.env.CODEYANG_API_KEY = 'test-key';
    process.env.CODEYANG_MAX_TOKENS = 'not-a-number';

    const config = loadConfig();

    // Should fall back to default
    expect(config.maxTokens).toBe(32000);
  });
});
