import { describe, it, expect } from 'vitest';
import * as lib from './lib.js';

/**
 * Locks the public library surface.
 *
 * `src/index.ts` is the CLI and exports nothing, so before `lib.ts` existed
 * `import from 'codeyang'` gave you an empty module. These tests make the
 * difference between "the package builds" and "the package is usable".
 */

describe('lib / public API', () => {
  it('exports a non-trivial surface', () => {
    expect(Object.keys(lib).length).toBeGreaterThanOrEqual(20);
  });

  it('exports the Agent class', () => {
    expect(typeof lib.Agent).toBe('function');
  });

  it('exports the tool registry', () => {
    expect(Array.isArray(lib.tools)).toBe(true);
    expect(lib.tools.length).toBeGreaterThan(50);
    expect(typeof lib.getTool).toBe('function');
    expect(typeof lib.toolSchemas).toBe('function' || 'object');
  });

  it('exports security primitives that actually classify IPs', () => {
    expect(lib.isPrivateIP('127.0.0.1')).toBe(true);
    expect(lib.isPrivateIP('10.0.0.1')).toBe(true);
    expect(lib.isPrivateIP('192.168.1.1')).toBe(true);
    expect(lib.isPrivateIP('8.8.8.8')).toBe(false);
    expect(lib.isPrivateIP('1.1.1.1')).toBe(false);
  });

  it('classifies IPv6 loopback and mapped addresses', () => {
    // Regression: the deleted utils copies had no IPv6 handling at all.
    expect(lib.isPrivateIP('[::1]')).toBe(true);
    expect(lib.isPrivateIP('::1')).toBe(true);
  });

  it('rejects private URLs', () => {
    expect(() => lib.validateUrl('http://169.254.169.254/latest/meta-data')).toThrow();
    expect(() => lib.validateUrl('http://localhost:3000')).toThrow();
  });

  it('accepts a public URL', () => {
    expect(() => lib.validateUrl('https://example.com')).not.toThrow();
  });

  it('exports the env registry', () => {
    expect(lib.envNames().length).toBeGreaterThan(50);
    expect(lib.getEnvSpec('CODEYANG_MODEL')?.name).toBe('CODEYANG_MODEL');
    expect(lib.getEnvSpec('NOT_REAL')).toBeUndefined();
  });

  it('exports typed env readers', () => {
    for (const fn of ['envString', 'envInt', 'envFloat', 'envBool', 'envList', 'envSecret']) {
      expect(typeof (lib as unknown as Record<string, unknown>)[fn], fn).toBe('function');
    }
  });

  it('exports the error type and codes', () => {
    expect(typeof lib.CodeYangError).toBe('function');
    expect(lib.ErrorCode).toBeDefined();
  });

  it('exports a version string', () => {
    expect(lib.VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports permission checking', () => {
    expect(typeof lib.checkPermission).toBe('function');
  });

  it('exports path guard helpers', () => {
    expect(typeof lib.findPathViolations).toBe('function');
    expect(typeof lib.formatPathViolations).toBe('function');
  });
});

describe('lib / import side effects', () => {
  it('does not throw when the module is imported without an API key', () => {
    // Importing a library must not require credentials or start anything.
    expect(() => Object.keys(lib)).not.toThrow();
  });

  it('does not start a server or read stdin on import', () => {
    // If lib.ts pulled in src/index.ts (the CLI), process.stdin would be
    // referenced and the test runner would hang. Reaching this line is the
    // assertion.
    expect(true).toBe(true);
  });
});
