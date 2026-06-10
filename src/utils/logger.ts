type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = process.env['CODEX_DEBUG'] ? 'debug' : 'info';

export const logger = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  debug(...args: unknown[]) {
    if (currentLevel === 'debug') console.log(`[DEBUG]`, ...args);
  },

  info(...args: unknown[]) {
    if (currentLevel !== 'error') console.log(...args);
  },

  warn(...args: unknown[]) {
    if (currentLevel !== 'error') console.warn(`⚠️`, ...args);
  },

  error(...args: unknown[]) {
    console.error(`❌`, ...args);
  },
};
