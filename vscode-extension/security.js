/**
 * Shared security utilities for command execution
 * Used by CLI, VS Code extension, and Electron app
 */

// User-customizable deny list from env var
const DENY_LIST = (process.env['CODEYANG_DENY_COMMANDS'] || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Check if a command matches any deny-listed word.
 * Enhanced parsing to handle quotes, escapes, and obfuscation attempts.
 */
function isDenied(command) {
  // Normalize the command: remove quotes, collapse escapes, lowercase
  const normalized = command
    .replace(/['"\\]/g, '') // Remove quotes and backslashes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .toLowerCase()
    .trim();

  // Split by shell metacharacters while preserving command structure
  const tokens = normalized.split(/[\s;|&`$()<>{}[\]]+/).filter(Boolean);

  for (const token of tokens) {
    for (const denied of DENY_LIST) {
      const deniedLower = denied.toLowerCase();

      // Exact match or prefix match
      if (token === deniedLower || token.startsWith(deniedLower)) {
        return true;
      }

      // Substring match to catch obfuscation
      if (token.includes(deniedLower)) {
        return true;
      }
    }
  }

  // Additional checks for dangerous patterns
  const dangerousPatterns = [
    /rm\s*-\s*rf/i,
    /curl.*\|\s*(sh|bash)/i,
    /wget.*\|\s*(sh|bash)/i,
    />\s*\/dev\/sd/i,
    /mkfs/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return true;
    }
  }

  return false;
}

/**
 * Rate limiter for tool calls
 */
class RateLimiter {
  constructor() {
    this.callRecords = new Map();
    this.limits = {
      file: { maxCalls: 100, windowMs: 60_000 },
      network: { maxCalls: 50, windowMs: 60_000 },
      bash: { maxCalls: 30, windowMs: 60_000 },
      git: { maxCalls: 50, windowMs: 60_000 },
    };
  }

  check(category) {
    const config = this.limits[category];
    if (!config) return;

    const now = Date.now();
    const records = this.callRecords.get(category) || [];

    // Remove expired records
    const validRecords = records.filter((r) => now - r.timestamp < config.windowMs);

    // Count total calls
    const totalCalls = validRecords.reduce((sum, r) => sum + r.count, 0);

    if (totalCalls >= config.maxCalls) {
      throw new Error(
        `[RATE LIMIT] Too many ${category} operations. ` +
        `Limit: ${config.maxCalls} calls per ${config.windowMs / 1000} seconds.`
      );
    }

    // Add new call record
    validRecords.push({ timestamp: now, count: 1 });
    this.callRecords.set(category, validRecords);
  }

  reset(category) {
    if (category) {
      this.callRecords.delete(category);
    } else {
      this.callRecords.clear();
    }
  }
}

const rateLimiter = new RateLimiter();

module.exports = {
  isDenied,
  rateLimiter,
};
