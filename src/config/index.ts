/**
 * Unified Configuration Management
 *
 * Centralized, type-safe configuration with validation and environment variable support.
 * Replaces scattered process.env access throughout the codebase.
 */

export interface CircuitBreakerConfig {
  threshold: number;
  resetMs: number;
  slowMs: number;
  window: number;
  rate: number;
  minReq: number;
}

export interface Config {
  // API Configuration
  apiKey: string;
  provider: 'anthropic' | 'deepseek' | 'openai';
  baseURL?: string;
  model: string;
  maxTokens: number;

  // Timeouts (milliseconds)
  streamTimeout: number;
  bashTimeout: number;

  // Rate Limits
  bashMaxOutput: number;

  // Paths
  codeyangHome?: string;

  // Debug
  debug: boolean;
  debugFilter: string[];

  // Features
  autoVerify: boolean;
  autoFixOnError: boolean;
  watchMode: boolean;

  // Agent
  maxTurns: number;
  maxRetries: number;

  // Circuit Breaker
  circuitBreaker: CircuitBreakerConfig;

  // Sandbox
  sandbox: {
    blockNetwork: boolean;
  };

  // Planner
  planner: {
    enabled: boolean;
  };

  // Reflexion
  reflexion: {
    enabled: boolean;
  };
}

/**
 * Validate and parse integer from environment variable
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate and parse float from environment variable
 */
function parseFloatEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const config: Config = {
    // API
    apiKey: process.env.CODEYANG_API_KEY || '',
    provider: (process.env.CODEYANG_PROVIDER as Config['provider']) || 'deepseek',
    baseURL: process.env.CODEYANG_BASE_URL,
    model: process.env.CODEYANG_MODEL || 'deepseek-chat',
    maxTokens: parseIntEnv(process.env.CODEYANG_MAX_TOKENS, 32000),

    // Timeouts
    streamTimeout: parseIntEnv(process.env.CODEYANG_STREAM_TIMEOUT, 300000),
    bashTimeout: parseIntEnv(process.env.CODEYANG_BASH_TIMEOUT, 60000),

    // Rate Limits
    bashMaxOutput: parseIntEnv(process.env.CODEYANG_BASH_MAX_OUTPUT, 102400),

    // Paths
    codeyangHome: process.env.CODEYANG_HOME,

    // Debug
    debug: process.env.CODEYANG_DEBUG === 'true',
    debugFilter: (process.env.CODEYANG_DEBUG_FILTER || '').split(',').filter(Boolean),

    // Features
    autoVerify: process.env.CODEYANG_AUTO_VERIFY === 'true',
    autoFixOnError: process.env.CODEYANG_AUTO_FIX === 'true',
    watchMode: process.env.CODEYANG_WATCH_MODE === 'true',

    // Agent
    maxTurns: parseIntEnv(process.env.CODEYANG_MAX_TURNS, 50),
    maxRetries: parseIntEnv(process.env.CODEYANG_MAX_RETRIES, 3),

    // Circuit Breaker
    circuitBreaker: {
      threshold: parseIntEnv(process.env.CODEYANG_CB_THRESHOLD, 5),
      resetMs: parseIntEnv(process.env.CODEYANG_CB_RESET_MS, 30000),
      slowMs: parseIntEnv(process.env.CODEYANG_CB_SLOW_MS, 30000),
      window: parseIntEnv(process.env.CODEYANG_CB_WINDOW, 50),
      rate: parseFloatEnv(process.env.CODEYANG_CB_RATE, 0.5),
      minReq: parseIntEnv(process.env.CODEYANG_CB_MIN_REQ, 10),
    },

    // Sandbox
    sandbox: {
      blockNetwork: process.env.CODEYANG_SANDBOX_BLOCK_NETWORK === 'true',
    },

    // Planner
    planner: {
      enabled: process.env.CODEYANG_PLANNER_ENABLED === 'true',
    },

    // Reflexion
    reflexion: {
      enabled: process.env.CODEYANG_REFLEXION_ENABLED === 'true',
    },
  };

  // Validation
  validateConfig(config);

  return config;
}

/**
 * Validate configuration
 */
function validateConfig(config: Config): void {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push('CODEYANG_API_KEY is required');
  }

  if (!['anthropic', 'deepseek', 'openai'].includes(config.provider)) {
    errors.push(`Invalid provider: ${config.provider}. Must be anthropic, deepseek, or openai`);
  }

  if (config.maxTokens <= 0) {
    errors.push('maxTokens must be positive');
  }

  if (config.streamTimeout <= 0) {
    errors.push('streamTimeout must be positive');
  }

  if (config.bashTimeout <= 0) {
    errors.push('bashTimeout must be positive');
  }

  if (config.circuitBreaker.rate < 0 || config.circuitBreaker.rate > 1) {
    errors.push('circuitBreaker.rate must be between 0 and 1');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get current configuration
 */
let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Reload configuration (for config file changes)
 */
export function reloadConfig(): Config {
  cachedConfig = loadConfig();
  return cachedConfig;
}

/**
 * Update configuration (for testing)
 */
export function setConfig(config: Partial<Config>): void {
  cachedConfig = { ...getConfig(), ...config };
}

/**
 * Clear configuration cache (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
