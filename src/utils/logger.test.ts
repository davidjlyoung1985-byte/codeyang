import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalLevel: string | undefined;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalLevel = process.env['CODEX_DEBUG'];
    logger.setLevel('info');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLevel === undefined) {
      delete process.env['CODEX_DEBUG'];
    } else {
      process.env['CODEX_DEBUG'] = originalLevel;
    }
  });

  it('should have all log methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.setLevel).toBe('function');
  });

  it('should log info messages', () => {
    logger.setLevel('info');
    logger.info('test message');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should log warn messages', () => {
    logger.setLevel('warn');
    logger.warn('warning message');
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should log error messages', () => {
    logger.setLevel('error');
    logger.error('error message');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should respect log levels', () => {
    logger.setLevel('error');
    logger.info('should not log');
    logger.warn('should not log');
    logger.error('should log');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should log debug messages when level is debug', () => {
    logger.setLevel('debug');
    logger.debug('debug message');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should not log debug when level is higher', () => {
    logger.setLevel('info');
    logger.debug('debug message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
