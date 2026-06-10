/**
 * Tool Argument Validation Utilities
 *
 * Provides defensive validation helpers for tool execute() functions.
 * Replaces unsafe patterns like `String(args['key'] ?? '')` with
 * explicit checks that produce clear, immediate error messages.
 */

/** Require a string parameter; throws if missing, null, or empty/whitespace-only. */
export function requiredString(args: Record<string, unknown>, key: string, label?: string): string {
  const val = args[key];
  if (val === undefined || val === null) {
    throw new Error(`Missing required parameter: ${label || key}`);
  }
  const str = String(val);
  if (str.trim() === '') {
    throw new Error(`Missing required parameter: ${label || key}`);
  }
  return str;
}

/** Require a number parameter; throws if missing, null, or not a valid number. */
export function requiredNumber(args: Record<string, unknown>, key: string, label?: string): number {
  const val = args[key];
  if (val === undefined || val === null) {
    throw new Error(`Missing required parameter: ${label || key}`);
  }
  const n = Number(val);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number for parameter: ${label || key}`);
  }
  return n;
}

/** Optional string parameter returns the value or a default. */
export function optionalString(args: Record<string, unknown>, key: string, defaultVal?: string): string | undefined {
  const val = args[key];
  if (val === undefined || val === null) return defaultVal;
  return String(val);
}

/** Optional number parameter; validates it can be parsed as a number. */
export function optionalNumber(args: Record<string, unknown>, key: string, defaultVal?: number): number | undefined {
  const val = args[key];
  if (val === undefined || val === null) return defaultVal;
  const n = Number(val);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number for parameter: ${key}`);
  }
  return n;
}

/** Optional boolean parameter; accepts true/'true' as truthy. */
export function optionalBoolean(args: Record<string, unknown>, key: string, defaultVal?: boolean): boolean | undefined {
  const val = args[key];
  if (val === undefined || val === null) return defaultVal;
  return val === true || val === 'true';
}
