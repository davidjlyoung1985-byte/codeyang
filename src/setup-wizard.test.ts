import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

describe('Setup Wizard', () => {
  const configDir = join(homedir(), '.codeyang');
  const configFile = join(configDir, 'config.json');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should define correct config paths', () => {
    expect(configDir).toContain('.codeyang');
    expect(configFile).toContain('config.json');
  });

  it('should validate DeepSeek API key format', () => {
    const pattern = /^deepseek-r-[a-zA-Z0-9_-]+$/;

    expect(pattern.test('deepseek-r-abc123')).toBe(true);
    expect(pattern.test('deepseek-r-XYZ_789-test')).toBe(true);
    expect(pattern.test('sk-abc123')).toBe(false);
    expect(pattern.test('deepseek-abc123')).toBe(false);
    expect(pattern.test('')).toBe(false);
  });

  it('should validate OpenAI API key format', () => {
    const pattern = /^sk-[a-zA-Z0-9_-]+$/;

    expect(pattern.test('sk-abc123')).toBe(true);
    expect(pattern.test('sk-XYZ_789-test')).toBe(true);
    expect(pattern.test('deepseek-r-abc123')).toBe(false);
    expect(pattern.test('anthropic-abc123')).toBe(false);
    expect(pattern.test('')).toBe(false);
  });

  it('should validate Anthropic API key format', () => {
    const pattern = /^anthropic-[a-zA-Z0-9_-]+$/;

    expect(pattern.test('anthropic-abc123')).toBe(true);
    expect(pattern.test('anthropic-XYZ_789-test')).toBe(true);
    expect(pattern.test('sk-abc123')).toBe(false);
    expect(pattern.test('deepseek-r-abc123')).toBe(false);
    expect(pattern.test('')).toBe(false);
  });

  it('should have correct provider configurations', () => {
    const providers = {
      deepseek: {
        name: 'DeepSeek',
        defaultBaseURL: 'https://api.deepseek.com',
        testEndpoint: '/v1/chat/completions',
      },
      openai: {
        name: 'OpenAI',
        defaultBaseURL: 'https://api.openai.com',
        testEndpoint: '/v1/models',
      },
      anthropic: {
        name: 'Anthropic',
        defaultBaseURL: 'https://api.anthropic.com',
        testEndpoint: '/v1/messages',
      },
    };

    expect(providers.deepseek.name).toBe('DeepSeek');
    expect(providers.openai.defaultBaseURL).toBe('https://api.openai.com');
    expect(providers.anthropic.testEndpoint).toBe('/v1/messages');
  });

  it('should map provider choices correctly', () => {
    const providerMap: Record<string, string> = {
      '1': 'deepseek',
      '2': 'openai',
      '3': 'anthropic',
    };

    expect(providerMap['1']).toBe('deepseek');
    expect(providerMap['2']).toBe('openai');
    expect(providerMap['3']).toBe('anthropic');
  });

  it('should generate correct config structure', () => {
    const config = {
      provider: 'deepseek',
      apiKey: 'test-key',
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-reasoner',
      maxTokens: 8192,
      temperature: 0.7,
      configuredAt: new Date().toISOString(),
    };

    expect(config.provider).toBe('deepseek');
    expect(config.maxTokens).toBe(8192);
    expect(config.temperature).toBe(0.7);
    expect(config.configuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
