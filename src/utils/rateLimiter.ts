/**
 * Rate limiter for tool calls to prevent DoS attacks via AI-generated spam.
 *
 * Tracks tool call counts per category within a sliding time window.
 * When limits are exceeded, throws an error to stop the operation.
 */

interface RateLimitConfig {
  maxCalls: number;
  windowMs: number;
}

interface CallRecord {
  timestamp: number;
  count: number;
}

// Rate limits per tool category (calls per minute)
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  file: { maxCalls: 100, windowMs: 60_000 }, // 100 file ops/min
  network: { maxCalls: 50, windowMs: 60_000 }, // 50 network requests/min
  bash: { maxCalls: 30, windowMs: 60_000 }, // 30 shell commands/min
  git: { maxCalls: 50, windowMs: 60_000 }, // 50 git ops/min
  mcp: { maxCalls: 100, windowMs: 60_000 }, // 100 MCP calls/min
};

// Store call records per category
const callRecords = new Map<string, CallRecord[]>();

/**
 * Check if a tool call is within rate limits.
 * Throws an error if limit exceeded.
 */
export function checkRateLimit(category: string): void {
  const config = RATE_LIMITS[category];
  if (!config) {
    // No limit configured for this category
    return;
  }

  const now = Date.now();
  const records = callRecords.get(category) || [];

  // Remove expired records outside the time window
  const validRecords = records.filter((r) => now - r.timestamp < config.windowMs);

  // Count total calls in the current window
  const totalCalls = validRecords.reduce((sum, r) => sum + r.count, 0);

  if (totalCalls >= config.maxCalls) {
    throw new Error(
      `[RATE LIMIT] Too many ${category} operations. ` +
        `Limit: ${config.maxCalls} calls per ${config.windowMs / 1000} seconds. ` +
        `Current: ${totalCalls} calls. Please wait before retrying.`,
    );
  }

  // Add new call record
  validRecords.push({ timestamp: now, count: 1 });
  callRecords.set(category, validRecords);
}

/**
 * Reset rate limits for a specific category (for testing).
 */
export function resetRateLimit(category?: string): void {
  if (category) {
    callRecords.delete(category);
  } else {
    callRecords.clear();
  }
}

/**
 * Get current usage stats for a category.
 */
export function getRateLimitStats(category: string): { current: number; max: number; windowMs: number } | null {
  const config = RATE_LIMITS[category];
  if (!config) return null;

  const now = Date.now();
  const records = callRecords.get(category) || [];
  const validRecords = records.filter((r) => now - r.timestamp < config.windowMs);
  const totalCalls = validRecords.reduce((sum, r) => sum + r.count, 0);

  return {
    current: totalCalls,
    max: config.maxCalls,
    windowMs: config.windowMs,
  };
}
