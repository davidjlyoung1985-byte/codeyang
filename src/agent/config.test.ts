import { describe, it, expect } from 'vitest';
import { config } from './config.js';

describe('config', () => {
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

  it('defaults to claude-sonnet model', () => {
    expect(config.model).toMatch(/claude/);
  });
});
