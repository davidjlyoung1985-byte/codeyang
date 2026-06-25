/**
 * Retry utilities for handling transient failures.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  shouldRetry: () => true,
};

/**
 * Execute function with exponential backoff retry.
 *
 * @example
 * const result = await withRetry(
 *   () => fetchData(),
 *   { maxRetries: 5, initialDelayMs: 2000 }
 * );
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!opts.shouldRetry(lastError, attempt)) {
        break;
      }

      // Wait before retry with exponential backoff
      await sleep(Math.min(delay, opts.maxDelayMs));
      delay *= opts.backoffMultiplier;
    }
  }

  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is a rate limit error.
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('rate limit') || message.includes('429') || message.includes('too many requests');
}

/**
 * Check if error is a timeout error.
 */
export function isTimeoutError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('timeout') || message.includes('timed out');
}

/**
 * Check if error is a network error.
 */
export function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed')
  );
}

/**
 * Default retry predicate for API calls.
 */
export function shouldRetryApiError(error: Error): boolean {
  return isRateLimitError(error) || isTimeoutError(error) || isNetworkError(error);
}
