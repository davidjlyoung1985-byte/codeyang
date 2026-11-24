import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { envString, envInt, envFloat, envBool, envList, envSecret } from './envReader.js';
import { renderEnvHelp } from './envHelp.js';
import { ENV_SPECS } from './env.js';

const KEYS = ENV_SPECS.map((s) => s.name);

describe('envReader', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  describe('envString', () => {
    it('reads a value', () => {
      process.env['CODEYANG_BASE_URL'] = 'https://x';
      expect(envString('CODEYANG_BASE_URL')).toBe('https://x');
    });

    it('falls back to the declared default', () => {
      expect(envString('CODEYANG_MODEL')).toBe('deepseek-chat');
    });

    it('treats an empty string as unset', () => {
      process.env['CODEYANG_BASE_URL'] = '';
      expect(envString('CODEYANG_BASE_URL', 'fallback')).toBe('fallback');
    });

    it('throws for an unknown variable', () => {
      expect(() => envString('NOT_DECLARED')).toThrow(/Unknown environment variable/);
    });

    it('enforces declared choices', () => {
      process.env['CODEYANG_PERMIT_RM'] = 'maybe';
      expect(() => envString('CODEYANG_PERMIT_RM')).toThrow(/must be one of allow \| ask \| deny/);
    });

    it('accepts a declared choice', () => {
      process.env['CODEYANG_PERMIT_RM'] = 'deny';
      expect(envString('CODEYANG_PERMIT_RM')).toBe('deny');
    });

    it('throws when required and absent with no default', () => {
      expect(() => envString('CODEYANG_TLS_CERT')).toThrow(/required/);
    });
  });

  describe('envInt', () => {
    it('parses an integer', () => {
      process.env['CODEYANG_MAX_TOKENS'] = '1234';
      expect(envInt('CODEYANG_MAX_TOKENS')).toBe(1234);
    });

    it('uses the declared default', () => {
      expect(envInt('CODEYANG_MAX_TOKENS')).toBe(32000);
    });

    it('throws on a non-numeric value instead of silently defaulting', () => {
      process.env['CODEYANG_MAX_TOKENS'] = 'lots';
      expect(() => envInt('CODEYANG_MAX_TOKENS')).toThrow(/must be an integer/);
    });

    it('throws when required and absent with no default', () => {
      expect(() => envInt('QT_BUILD_COMPILE_TIMEOUT')).toThrow(/required/);
    });
  });

  describe('envFloat', () => {
    it('parses a float', () => {
      process.env['CODEYANG_CB_RATE'] = '0.25';
      expect(envFloat('CODEYANG_CB_RATE')).toBe(0.25);
    });

    it('uses the declared default', () => {
      expect(envFloat('CODEYANG_CB_RATE')).toBe(0.5);
    });

    it('throws on garbage', () => {
      process.env['CODEYANG_CB_RATE'] = 'half';
      expect(() => envFloat('CODEYANG_CB_RATE')).toThrow(/must be a number/);
    });
  });

  describe('envBool', () => {
    it.each(['true', 'TRUE', '1', 'yes', 'on'])('treats %s as true', (v) => {
      process.env['CODEYANG_AUTO_VERIFY'] = v;
      expect(envBool('CODEYANG_AUTO_VERIFY')).toBe(true);
    });

    it.each(['false', 'FALSE', '0', 'no', 'off'])('treats %s as false', (v) => {
      // This is the regression that `Boolean(process.env.X)` got wrong:
      // the string "false" is truthy in JS.
      process.env['CODEYANG_AUTO_VERIFY'] = v;
      expect(envBool('CODEYANG_AUTO_VERIFY')).toBe(false);
    });

    it('uses the declared default when unset', () => {
      expect(envBool('CODEYANG_SANDBOX_BLOCK_NETWORK')).toBe(false);
      expect(envBool('CODEYANG_AUTO_VERIFY')).toBe(true);
    });

    it('throws on an unrecognised value', () => {
      process.env['CODEYANG_AUTO_VERIFY'] = 'perhaps';
      expect(() => envBool('CODEYANG_AUTO_VERIFY')).toThrow(/must be a boolean/);
    });
  });

  describe('envList', () => {
    it('splits, trims and drops empties', () => {
      process.env['CODEYANG_DENY_COMMANDS'] = ' rm , ,shutdown, reboot ';
      expect(envList('CODEYANG_DENY_COMMANDS')).toEqual(['rm', 'shutdown', 'reboot']);
    });

    it('returns an empty array when unset', () => {
      expect(envList('CODEYANG_DENY_COMMANDS')).toEqual([]);
    });

    it('throws for an unknown variable', () => {
      expect(() => envList('NOPE')).toThrow(/Unknown environment variable/);
    });
  });

  describe('envSecret', () => {
    it('reads the value', () => {
      process.env['CODEYANG_API_KEY'] = 'sk-abc';
      expect(envSecret('CODEYANG_API_KEY')).toBe('sk-abc');
    });

    it('returns the fallback when unset', () => {
      expect(envSecret('CODEYANG_API_KEY')).toBe('');
      expect(envSecret('CODEYANG_API_KEY', 'dflt')).toBe('dflt');
    });
  });
});

describe('envHelp', () => {
  it('lists every declared variable', () => {
    const help = renderEnvHelp();
    for (const spec of ENV_SPECS) {
      expect(help, `help is missing ${spec.name}`).toContain(spec.name);
    }
  });

  it('groups output by category heading', () => {
    const help = renderEnvHelp();
    expect(help).toMatch(/# API credentials/);
    expect(help).toMatch(/# Permissions/);
    expect(help).toMatch(/# Sandbox/);
  });

  it('shows choices and defaults', () => {
    const help = renderEnvHelp();
    expect(help).toContain('allow|ask|deny');
    expect(help).toContain('default: deepseek-chat');
  });

  it('honours the indent argument', () => {
    const help = renderEnvHelp('>>');
    for (const line of help.split('\n').filter(Boolean)) {
      expect(line.startsWith('>>')).toBe(true);
    }
  });
});
