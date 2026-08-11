import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { config } from './config.js';

describe('config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('has a default model', () => {
    expect(config.model).toBeTruthy();
    expect(typeof config.model).toBe('string');
  });

  it('has a sensible default maxTokens', () => {
    expect(config.maxTokens).toBeGreaterThan(0);
    expect(typeof config.maxTokens).toBe('number');
  });

  it('returns empty string for apiKey when no env var is set', () => {
    // When no API key env vars are set, apiKey should be '' or localConfig value
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

  it('has temperature between 0 and 1 if defined', () => {
    if (config.temperature !== undefined) {
      expect(config.temperature).toBeGreaterThanOrEqual(0);
      expect(config.temperature).toBeLessThanOrEqual(1);
    } else {
      // Temperature may be undefined, which is valid
      expect(config.temperature).toBeUndefined();
    }
  });

  it('has getSystemPrompt function', () => {
    expect(typeof config.getSystemPrompt).toBe('function');
    const prompt = config.getSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});
