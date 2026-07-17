/**
 * Tests for schema-validate.ts — JSON Schema parameter validation
 */
import { describe, it, expect } from 'vitest';
import { validateParams } from './schema-validate.js';

describe('validateParams', () => {
  const stringSchema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  };

  const fullSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'number' },
      flag: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string' } },
      config: { type: 'object' },
      mode: { type: 'string', enum: ['fast', 'slow'] },
    },
    required: ['name'],
  };

  it('passes valid args', () => {
    const errors = validateParams({ name: 'test' }, stringSchema);
    expect(errors).toEqual([]);
  });

  it('catches missing required field', () => {
    const errors = validateParams({}, stringSchema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Missing required');
  });

  it('catches wrong type for string', () => {
    const errors = validateParams({ name: 123 }, stringSchema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('must be a string');
  });

  it('catches wrong type for number', () => {
    const errors = validateParams({ name: 'test', count: 'abc' }, fullSchema);
    expect(errors.some((e) => e.includes('count') && e.includes('number'))).toBe(true);
  });

  it('catches wrong type for boolean', () => {
    const errors = validateParams({ name: 'test', flag: 'yes' }, fullSchema);
    expect(errors.some((e) => e.includes('flag') && e.includes('boolean'))).toBe(true);
  });

  it('catches wrong type for array', () => {
    const errors = validateParams({ name: 'test', tags: 'not-array' }, fullSchema);
    expect(errors.some((e) => e.includes('tags') && e.includes('array'))).toBe(true);
  });

  it('validates array item types', () => {
    const errors = validateParams({ name: 'test', tags: [123, 456] }, fullSchema);
    expect(errors.some((e) => e.includes('tags') && e.includes('string'))).toBe(true);
  });

  it('catches wrong type for object', () => {
    const errors = validateParams({ name: 'test', config: 'not-object' }, fullSchema);
    expect(errors.some((e) => e.includes('config') && e.includes('object'))).toBe(true);
  });

  it('validates enum values', () => {
    const errors = validateParams({ name: 'test', mode: 'turbo' }, fullSchema);
    expect(errors.some((e) => e.includes('mode') && e.includes('one of'))).toBe(true);
  });

  it('passes valid enum value', () => {
    const errors = validateParams({ name: 'test', mode: 'fast' }, fullSchema);
    expect(errors.filter((e) => e.includes('mode'))).toEqual([]);
  });

  it('handles null/undefined values gracefully', () => {
    const errors = validateParams({ name: null }, stringSchema);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns empty for empty schema', () => {
    const errors = validateParams({}, { type: 'object' });
    expect(errors).toEqual([]);
  });

  it('handles null schema gracefully', () => {
    const errors = validateParams({}, null as unknown as Record<string, unknown>);
    expect(errors).toEqual([]);
  });
});
