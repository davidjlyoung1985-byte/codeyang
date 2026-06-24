type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 日志级别数值映射，用于比较。数值越大越严格。 */
const LEVEL_MAP: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = process.env['CODEX_DEBUG'] ? 'debug' : 'info';

/** 检查当前级别是否允许输出指定级别的日志 */
function shouldLog(level: LogLevel): boolean {
  return LEVEL_MAP[level] >= LEVEL_MAP[currentLevel];
}

export const logger = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  debug(...args: unknown[]) {
    if (shouldLog('debug')) console.log(`[DEBUG]`, ...args);
  },

  info(...args: unknown[]) {
    if (shouldLog('info')) console.log(...args);
  },

  warn(...args: unknown[]) {
    if (shouldLog('warn')) console.warn(`⚠️`, ...args);
  },

  error(...args: unknown[]) {
    if (shouldLog('error')) console.error(`❌`, ...args);
  },
};
