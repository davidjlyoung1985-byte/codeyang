/**
 * Tests for small utility files: validate.ts, errors.ts, aliases.ts
 */
import { describe, it, expect } from 'vitest';

describe('validate', () => {
  let validate: typeof import('./validate.js');

  beforeAll(async () => {
    validate = await import('./validate.js');
  });

  it('requiredString returns value when present', () => {
    const result = validate.requiredString({ key: 'hello' }, 'key');
    expect(result).toBe('hello');
  });

  it('requiredString throws when missing', () => {
    expect(() => validate.requiredString({}, 'key')).toThrow();
  });

  it('requiredString throws when empty', () => {
    expect(() => validate.requiredString({ key: '' }, 'key')).toThrow();
  });

  it('optionalString returns value when present', () => {
    const result = validate.optionalString({ key: 'hello' }, 'key');
    expect(result).toBe('hello');
  });

  it('optionalString returns default when missing', () => {
    const result = validate.optionalString({}, 'key', 'default');
    expect(result).toBe('default');
  });

  it('optionalString returns undefined when missing without default', () => {
    const result = validate.optionalString({}, 'key');
    expect(result).toBeUndefined();
  });

  it('optionalNumber returns value when present', () => {
    const result = validate.optionalNumber({ key: 42 }, 'key');
    expect(result).toBe(42);
  });

  it('optionalNumber returns default when missing', () => {
    const result = validate.optionalNumber({}, 'key', 99);
    expect(result).toBe(99);
  });

  it('optionalBoolean returns value when present', () => {
    const result = validate.optionalBoolean({ key: true }, 'key');
    expect(result).toBe(true);
  });

  it('optionalBoolean returns default when missing', () => {
    const result = validate.optionalBoolean({}, 'key', true);
    expect(result).toBe(true);
  });

  it('optionalBoolean returns undefined without default', () => {
    const result = validate.optionalBoolean({}, 'key');
    expect(result).toBeUndefined();
  });
});

describe('errors', () => {
  let errors: typeof import('./errors.js');

  beforeAll(async () => {
    errors = await import('./errors.js');
  });

  it('toolError formats error message', () => {
    const result = errors.toolError('Bash', 'Command failed', 'Try again');
    expect(result).toContain('Bash');
    expect(result).toContain('Command failed');
    expect(result).toContain('Try again');
  });

  it('toolError accepts optional fix', () => {
    const result = errors.toolError('Test', 'Error msg');
    expect(result).toContain('Test');
    expect(result).toContain('Error msg');
  });

  it('invalidParam formats parameter error', () => {
    const result = errors.invalidParam('command', 'a non-empty string');
    expect(result).toContain('command');
    expect(result).toContain('non-empty string');
  });
});

describe('aliases', () => {
  it('exports getToolAliases and getAllAliases functions', async () => {
    const aliases = await import('./aliases.js');
    expect(typeof aliases.getToolAliases).toBe('function');
    expect(typeof aliases.getAllAliases).toBe('function');
  });

  it('getAllAliases returns a Map', async () => {
    const aliases = await import('./aliases.js');
    const result = aliases.getAllAliases();
    expect(result instanceof Map).toBe(true);
    expect(result.size).toBeGreaterThan(0);
  });

  it('getToolAliases returns aliases for known tool', async () => {
    const aliases = await import('./aliases.js');
    const result = aliases.getToolAliases('Bash');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getToolAliases returns empty array for unknown tool', async () => {
    const aliases = await import('./aliases.js');
    const result = aliases.getToolAliases('NonexistentTool');
    expect(result).toEqual([]);
  });
});
