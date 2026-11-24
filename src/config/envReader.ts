/**
 * Typed readers for the variables declared in `env.ts`.
 *
 * Every getter validates against the spec: unknown names throw in development
 * builds so typos surface immediately, and enum-like variables are checked
 * against their declared `choices`.
 */

import { getEnvSpec, type EnvSpec } from './env.js';

function specOrThrow(name: string): EnvSpec {
  const spec = getEnvSpec(name);
  if (!spec) {
    throw new Error(
      `Unknown environment variable "${name}". Declare it in src/config/env.ts — ` +
        `undeclared variables break the --help output and the drift check.`,
    );
  }
  return spec;
}

function raw(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}

export function envString(name: string, fallback?: string): string {
  const spec = specOrThrow(name);
  const value = raw(name) ?? (spec.default !== undefined ? String(spec.default) : undefined);
  if (value === undefined) {
    if (fallback === undefined) throw new Error(`Environment variable ${name} is required but not set`);
    return fallback;
  }
  if (spec.choices && !spec.choices.includes(value)) {
    throw new Error(`Environment variable ${name} must be one of ${spec.choices.join(' | ')} (got "${value}")`);
  }
  return value;
}

export function envInt(name: string, fallback?: number): number {
  const spec = specOrThrow(name);
  const value = raw(name);
  if (value === undefined) {
    if (spec.default !== undefined) return Number(spec.default);
    if (fallback === undefined) throw new Error(`Environment variable ${name} is required but not set`);
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer (got "${value}")`);
  }
  return parsed;
}

export function envFloat(name: string, fallback?: number): number {
  const spec = specOrThrow(name);
  const value = raw(name);
  if (value === undefined) {
    if (spec.default !== undefined) return Number(spec.default);
    if (fallback === undefined) throw new Error(`Environment variable ${name} is required but not set`);
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number (got "${value}")`);
  }
  return parsed;
}

/**
 * Booleans accept 'true'/'1'/'yes' and 'false'/'0'/'no' (case-insensitive).
 *
 * Deliberately stricter than `Boolean(process.env.X)`, which treats the string
 * "false" as truthy — the bug behind `CODEYANG_AUTO_VERIFY=false` still
 * enabling verification.
 */
export function envBool(name: string, fallback?: boolean): boolean {
  const spec = specOrThrow(name);
  const value = raw(name);
  if (value === undefined) {
    if (spec.default !== undefined) return Boolean(spec.default);
    if (fallback === undefined) throw new Error(`Environment variable ${name} is required but not set`);
    return fallback;
  }
  const lower = value.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(lower)) return true;
  if (['false', '0', 'no', 'off'].includes(lower)) return false;
  throw new Error(`Environment variable ${name} must be a boolean (got "${value}")`);
}

/** Comma-separated list, trimmed, empty entries dropped. */
export function envList(name: string): string[] {
  specOrThrow(name);
  const value = raw(name);
  if (value === undefined) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read a secret; never logged. */
export function envSecret(name: string, fallback = ''): string {
  specOrThrow(name);
  return raw(name) ?? fallback;
}
