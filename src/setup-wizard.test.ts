import { describe, it, expect } from 'vitest';
import {
  providers,
  validateApiKey,
  buildConfig,
  configDir,
  configFile,
  main,
  testConnection,
  type ProviderConfig,
  type Prompter,
  type WizardDeps,
} from './setup-wizard.js';

/**
 * These tests import the real module. The previous version of this file
 * re-implemented the regexes locally and asserted against its own copies,
 * so it reported "passing" while `setup-wizard.ts` stayed at 0% coverage.
 */

describe('setup-wizard / providers', () => {
  it('defines the three supported providers', () => {
    expect(Object.keys(providers).sort()).toEqual(['anthropic', 'deepseek', 'openai']);
  });

  it('every provider has a complete config', () => {
    for (const [key, p] of Object.entries(providers) as [string, ProviderConfig][]) {
      expect(p.name, key).toBeTruthy();
      expect(p.apiKeyPattern, key).toBeInstanceOf(RegExp);
      expect(p.apiKeyExample, key).toBeTruthy();
      expect(p.defaultBaseURL, key).toMatch(/^https:\/\//);
      expect(p.testEndpoint, key).toMatch(/^\//);
      expect(p.instructions, key).toBeTruthy();
    }
  });

  it('provider keys match their config names case-insensitively', () => {
    expect(providers['deepseek'].name.toLowerCase()).toBe('deepseek');
    expect(providers['openai'].name.toLowerCase()).toBe('openai');
    expect(providers['anthropic'].name.toLowerCase()).toBe('anthropic');
  });

  it('resolves to ~/.codeyang/config.json', () => {
    expect(configDir).toContain('.codeyang');
    expect(configFile).toBe(
      `${configDir}\\config.json`.replace('\\\\', '\\').replace(/\//g, process.platform === 'win32' ? '\\' : '/'),
    );
  });
});

describe('setup-wizard / validateApiKey', () => {
  it('rejects empty and whitespace-only keys', () => {
    expect(validateApiKey(providers['deepseek'], '')).toBe(false);
    expect(validateApiKey(providers['deepseek'], '   ')).toBe(false);
  });

  it('accepts valid keys for each provider', () => {
    expect(validateApiKey(providers['deepseek'], 'deepseek-r-abc123')).toBe(true);
    expect(validateApiKey(providers['openai'], 'sk-abc123')).toBe(true);
    expect(validateApiKey(providers['anthropic'], 'anthropic-abc123')).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateApiKey(providers['openai'], '  sk-abc123  ')).toBe(true);
  });

  it('rejects keys from a different provider', () => {
    expect(validateApiKey(providers['openai'], 'deepseek-r-abc123')).toBe(false);
    expect(validateApiKey(providers['deepseek'], 'sk-abc123')).toBe(false);
    expect(validateApiKey(providers['anthropic'], 'sk-abc123')).toBe(false);
  });

  it('rejects keys with invalid characters', () => {
    expect(validateApiKey(providers['openai'], 'sk-abc 123')).toBe(false);
    expect(validateApiKey(providers['openai'], 'sk-abc!/123')).toBe(false);
  });
});

describe('setup-wizard / buildConfig', () => {
  it('maps provider to the expected default model', () => {
    expect(buildConfig('deepseek', 'k', 'https://a').model).toBe('deepseek-reasoner');
    expect(buildConfig('openai', 'k', 'https://b').model).toBe('gpt-4');
    expect(buildConfig('anthropic', 'k', 'https://c').model).toBe('claude-sonnet-4-20250514');
  });

  it('falls back to the anthropic model for unknown providers', () => {
    expect(buildConfig('unknown', 'k', 'https://d').model).toBe('claude-sonnet-4-20250514');
  });

  it('carries credentials and base URL through', () => {
    const cfg = buildConfig('openai', 'sk-test', 'https://api.example.com');
    expect(cfg['provider']).toBe('openai');
    expect(cfg['apiKey']).toBe('sk-test');
    expect(cfg['baseURL']).toBe('https://api.example.com');
  });

  it('emits sensible numeric limits', () => {
    const cfg = buildConfig('deepseek', 'k', 'https://a');
    expect(cfg['maxTokens']).toBe(8192);
    expect(cfg['temperature']).toBe(0.7);
  });

  it('stamps a parseable ISO timestamp', () => {
    const cfg = buildConfig('deepseek', 'k', 'https://a');
    const at = cfg['configuredAt'] as string;
    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });
});

/** Build a fake prompter that answers in order and records the questions asked. */
function fakePrompt(answers: string[]) {
  const asked: string[] = [];
  let i = 0;
  const prompter: Prompter = {
    question: async (q: string) => {
      asked.push(q);
      const a = answers[i++];
      if (a === undefined) throw new Error('ran out of scripted answers');
      return a;
    },
    close: () => {},
  };
  return { prompter, asked };
}

function baseDeps(over: Partial<WizardDeps> = {}): WizardDeps {
  return {
    configExists: () => false,
    testConnection: async () => true,
    saveConfig: async () => {},
    onExit: () => {},
    ...over,
  };
}

describe('setup-wizard / main() flow', () => {
  it('completes the happy path and persists the chosen provider', async () => {
    const { prompter, asked } = fakePrompt(['1', 'deepseek-r-abc']);
    const saved: Array<[string, string, string]> = [];

    await main(
      baseDeps({
        prompt: prompter,
        saveConfig: async (p, k, u) => {
          saved.push([p, k, u]);
        },
      }),
    );

    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toBe('deepseek');
    expect(saved[0][1]).toBe('deepseek-r-abc');
    expect(saved[0][2]).toBe(providers['deepseek'].defaultBaseURL);
    expect(asked.length).toBeGreaterThanOrEqual(2);
  });

  it('re-prompts until the provider choice is valid', async () => {
    const { prompter, asked } = fakePrompt(['9', 'abc', '2', 'sk-good']);
    const saved: string[] = [];

    await main(
      baseDeps({
        prompt: prompter,
        saveConfig: async (p) => {
          saved.push(p);
        },
      }),
    );

    expect(saved).toEqual(['openai']);
    expect(asked.filter((q) => q.includes('请选择')).length).toBe(3);
  });

  it('re-prompts on a malformed API key, then accepts a valid one', async () => {
    const { prompter } = fakePrompt(['1', 'wrong-key', 'y', 'deepseek-r-ok']);
    const saved: string[] = [];

    await main(
      baseDeps({
        prompt: prompter,
        saveConfig: async (_p, k) => {
          saved.push(k);
        },
      }),
    );

    expect(saved).toEqual(['deepseek-r-ok']);
  });

  it('aborts without saving when the key is rejected and retry is declined', async () => {
    const { prompter } = fakePrompt(['1', 'wrong-key', 'n']);
    let saveCalled = false;

    await main(
      baseDeps({
        prompt: prompter,
        saveConfig: async () => {
          saveCalled = true;
        },
      }),
    );

    expect(saveCalled).toBe(false);
  });

  it('aborts without saving when the connection test fails and retry is declined', async () => {
    const { prompter } = fakePrompt(['1', 'deepseek-r-abc', 'n']);
    let saveCalled = false;

    await main(
      baseDeps({
        prompt: prompter,
        testConnection: async () => false,
        saveConfig: async () => {
          saveCalled = true;
        },
      }),
    );

    expect(saveCalled).toBe(false);
  });

  it('retries the key after a failed connection test', async () => {
    const { prompter } = fakePrompt(['1', 'deepseek-r-bad', 'y', 'deepseek-r-good']);
    const saved: string[] = [];
    let attempt = 0;

    await main(
      baseDeps({
        prompt: prompter,
        testConnection: async () => {
          attempt++;
          return attempt > 1;
        },
        saveConfig: async (_p, k) => {
          saved.push(k);
        },
      }),
    );

    expect(saved).toEqual(['deepseek-r-good']);
  });

  it('returns early when an existing config is found and overwrite is declined', async () => {
    const { prompter } = fakePrompt(['n']);
    let saveCalled = false;

    await main(
      baseDeps({
        prompt: prompter,
        configExists: () => true,
        saveConfig: async () => {
          saveCalled = true;
        },
      }),
    );

    expect(saveCalled).toBe(false);
  });

  it('proceeds when an existing config is overwritten', async () => {
    const { prompter } = fakePrompt(['y', '3', 'anthropic-xyz']);
    const saved: string[] = [];

    await main(
      baseDeps({
        prompt: prompter,
        configExists: () => true,
        saveConfig: async (p) => {
          saved.push(p);
        },
      }),
    );

    expect(saved).toEqual(['anthropic']);
  });

  it('routes fatal errors through the injected exit hook', async () => {
    const { prompter } = fakePrompt([]);
    const exits: number[] = [];

    await main(
      baseDeps({
        prompt: prompter,
        onExit: (code) => {
          exits.push(code);
        },
      }),
    );

    expect(exits).toEqual([1]);
  });

  it('always closes the prompt, even on the error path', async () => {
    let closed = 0;
    const prompter: Prompter = {
      question: async () => {
        throw new Error('boom');
      },
      close: () => {
        closed++;
      },
    };

    await main(baseDeps({ prompt: prompter, onExit: () => {} }));

    expect(closed).toBe(1);
  });
});

describe('setup-wizard / testConnection', () => {
  /** Minimal fetch stub returning a canned status. */
  const fetchReturning = (status: number) =>
    (async () => ({ status, ok: status >= 200 && status < 300 }) as Response) as unknown as typeof fetch;

  it('accepts a 200 response', async () => {
    expect(await testConnection(providers['openai'], 'sk-x', fetchReturning(200))).toBe(true);
  });

  it('accepts a 400 response (auth passed, probe payload malformed)', async () => {
    expect(await testConnection(providers['openai'], 'sk-x', fetchReturning(400))).toBe(true);
  });

  it('treats 429 as valid but rate limited', async () => {
    expect(await testConnection(providers['openai'], 'sk-x', fetchReturning(429))).toBe(true);
  });

  it('rejects 401 (invalid key)', async () => {
    expect(await testConnection(providers['openai'], 'sk-x', fetchReturning(401))).toBe(false);
  });

  it('rejects other error statuses', async () => {
    expect(await testConnection(providers['openai'], 'sk-x', fetchReturning(500))).toBe(false);
    expect(await testConnection(providers['openai'], 'sk-x', fetchReturning(403))).toBe(false);
  });

  it('returns false on network error', async () => {
    const failing = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    expect(await testConnection(providers['openai'], 'sk-x', failing)).toBe(false);
  });

  it('returns false on timeout', async () => {
    const timingOut = (async () => {
      throw new Error('The operation was aborted due to timeout');
    }) as unknown as typeof fetch;
    expect(await testConnection(providers['openai'], 'sk-x', timingOut)).toBe(false);
  });

  it('sends Anthropic-specific headers and a POST body', async () => {
    let captured: RequestInit | undefined;
    const spy = (async (_url: string, init: RequestInit) => {
      captured = init;
      return { status: 200, ok: true } as Response;
    }) as unknown as typeof fetch;

    await testConnection(providers['anthropic'], 'anthropic-x', spy);

    expect(captured?.method).toBe('POST');
    const headers = captured?.headers as Record<string, string>;
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(typeof captured?.body).toBe('string');
  });

  it('uses GET without a body for non-Anthropic providers', async () => {
    let captured: RequestInit | undefined;
    const spy = (async (_url: string, init: RequestInit) => {
      captured = init;
      return { status: 200, ok: true } as Response;
    }) as unknown as typeof fetch;

    await testConnection(providers['deepseek'], 'deepseek-r-x', spy);

    expect(captured?.method).toBe('GET');
    expect(captured?.body).toBeUndefined();
  });
});
