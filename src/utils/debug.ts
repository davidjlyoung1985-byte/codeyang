/**
 * Debug utilities for CodeYang development.
 *
 * Usage:
 *   import { debugLog, debugTime } from './debug.js';
 *
 *   debugLog('tool-execution', 'Bash', { command: 'ls' });
 *   const timer = debugTime('expensive-operation');
 *   // ... operation ...
 *   timer.end();
 */

const DEBUG_ENABLED = process.env.CODEYANG_DEBUG === 'true';
const DEBUG_FILTER = (process.env.CODEYANG_DEBUG_FILTER || '').split(',').filter(Boolean);

export interface DebugContext {
  [key: string]: unknown;
}

/**
 * Debug log with category filtering.
 *
 * Set CODEYANG_DEBUG=true to enable all.
 * Set CODEYANG_DEBUG_FILTER=tool,agent to filter by category.
 */
export function debugLog(category: string, message: string, context?: DebugContext): void {
  if (!DEBUG_ENABLED) return;

  if (DEBUG_FILTER.length > 0 && !DEBUG_FILTER.includes(category)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [DEBUG:${category}]`;

  if (context) {
    console.debug(prefix, message, JSON.stringify(context, null, 2));
  } else {
    console.debug(prefix, message);
  }
}

/**
 * Debug timer for performance measurement.
 */
export interface DebugTimer {
  end: (context?: DebugContext) => number;
}

export function debugTime(label: string, category = 'perf'): DebugTimer {
  const startTime = Date.now();

  return {
    end: (context?: DebugContext) => {
      const duration = Date.now() - startTime;
      debugLog(category, `${label} took ${duration}ms`, context);
      return duration;
    },
  };
}

/**
 * Debug inspector for objects.
 */
export function debugInspect(label: string, obj: unknown, category = 'inspect'): void {
  if (!DEBUG_ENABLED) return;

  debugLog(category, label, {
    type: typeof obj,
    constructor: obj?.constructor?.name,
    value: obj,
  });
}

/**
 * Debug trace for call stacks.
 */
export function debugTrace(label: string, category = 'trace'): void {
  if (!DEBUG_ENABLED) return;

  const stack = new Error().stack?.split('\n').slice(2).join('\n') || '(no stack)';
  debugLog(category, label, { stack });
}

/**
 * Conditional assertion (only in debug mode).
 */
export function debugAssert(condition: boolean, message: string): void {
  if (!DEBUG_ENABLED) return;

  if (!condition) {
    console.error(`[DEBUG:ASSERT] ${message}`);
    debugTrace('Assertion failed', 'assert');
    throw new Error(`Debug assertion failed: ${message}`);
  }
}

/**
 * Get debug configuration.
 */
export function getDebugConfig(): {
  enabled: boolean;
  filter: string[];
} {
  return {
    enabled: DEBUG_ENABLED,
    filter: DEBUG_FILTER,
  };
}

/**
 * Enable debug mode programmatically (for testing).
 */
export function setDebugMode(enabled: boolean, filter?: string[]): void {
  process.env.CODEYANG_DEBUG = enabled ? 'true' : 'false';
  if (filter) {
    process.env.CODEYANG_DEBUG_FILTER = filter.join(',');
  }
}
