import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConfig, apiFetch, saveTaskLocally, handleTask, handleLine, BRIDGE_DIR, TASKS_DIR } from './claude-agent.js';
import type { BridgeTask } from './types.js';

/**
 * These tests import the real module. The previous version of this file never
 * imported `claude-agent.ts` — it asserted things like
 * `process.env.BRIDGE_TOKEN === 'test-token-123'` after setting it itself,
 * which is a tautology. The module stayed at 0% coverage while the suite
 * reported "passing".
 */

describe('claude-agent / getConfig', () => {
  const originalEnv = { ...process.env };
  const originalArgv = [...process.argv];

  beforeEach(() => {
    delete process.env['BRIDGE_URL'];
    delete process.env['BRIDGE_TOKEN'];
    process.argv = ['node', 'claude-agent.ts'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
  });

  it('falls back to default URL and empty token', () => {
    const cfg = getConfig();
    expect(cfg.url).toBe('http://127.0.0.1:9876');
    expect(cfg.token).toBe('');
  });

  it('reads BRIDGE_URL and BRIDGE_TOKEN from the environment', () => {
    process.env['BRIDGE_URL'] = 'http://10.0.0.5:8080';
    process.env['BRIDGE_TOKEN'] = 'env-token';

    const cfg = getConfig();
    expect(cfg.url).toBe('http://10.0.0.5:8080');
    expect(cfg.token).toBe('env-token');
  });

  it('lets --token override the environment', () => {
    process.env['BRIDGE_TOKEN'] = 'env-token';
    process.argv = ['node', 'claude-agent.ts', '--token', 'cli-token'];

    const cfg = getConfig();
    expect(cfg.token).toBe('cli-token');
  });

  it('lets --url override the environment', () => {
    process.env['BRIDGE_URL'] = 'http://env:1111';
    process.argv = ['node', 'claude-agent.ts', '--url', 'http://cli:2222'];

    const cfg = getConfig();
    expect(cfg.url).toBe('http://cli:2222');
  });

  it('handles --url and --token together', () => {
    process.argv = ['node', 'claude-agent.ts', '--url', 'http://both:9000', '--token', 'both-token'];

    const cfg = getConfig();
    expect(cfg.url).toBe('http://both:9000');
    expect(cfg.token).toBe('both-token');
  });

  it('ignores a flag at the end of argv with no value', () => {
    process.argv = ['node', 'claude-agent.ts', '--token'];

    const cfg = getConfig();
    expect(cfg.token).toBe('');
  });

  it('ignores unrelated arguments', () => {
    process.argv = ['node', 'claude-agent.ts', '--verbose', '--token', 'real-token'];

    const cfg = getConfig();
    expect(cfg.token).toBe('real-token');
  });

  it('writes parsed values back into process.env', () => {
    process.argv = ['node', 'claude-agent.ts', '--token', 'persisted'];
    getConfig();
    expect(process.env['BRIDGE_TOKEN']).toBe('persisted');
  });
});

describe('claude-agent / paths', () => {
  it('scopes the bridge dir under the codeyang home', () => {
    expect(BRIDGE_DIR).toContain('bridge');
  });

  it('keeps task files in a subdirectory of the bridge dir', () => {
    expect(TASKS_DIR.startsWith(BRIDGE_DIR)).toBe(true);
    expect(TASKS_DIR).toContain('claude-tasks');
  });
});

describe('claude-agent / apiFetch', () => {
  const originalEnv = { ...process.env };
  const originalArgv = [...process.argv];
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env['BRIDGE_URL'] = 'http://bridge.test';
    process.env['BRIDGE_TOKEN'] = 'tok';
    process.argv = ['node', 'claude-agent.ts'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    })) as unknown as typeof fetch;

    const out = await apiFetch<{ hello: string }>('GET', '/api/health');
    expect(out.hello).toBe('world');
  });

  it('builds the URL from the configured base', async () => {
    let calledUrl = '';
    globalThis.fetch = (async (url: string) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await apiFetch('GET', '/api/health');
    expect(calledUrl).toBe('http://bridge.test/api/health');
  });

  it('sends the bearer token from config', async () => {
    let headers: Record<string, string> = {};
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await apiFetch('GET', '/x');
    expect(headers['Authorization']).toBe('Bearer tok');
  });

  it('prefers an explicitly passed token over the configured one', async () => {
    let headers: Record<string, string> = {};
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await apiFetch('GET', '/x', undefined, 'explicit');
    expect(headers['Authorization']).toBe('Bearer explicit');
  });

  it('serializes the request body when provided', async () => {
    let body: unknown;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      body = init.body;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await apiFetch('PUT', '/t', { status: 'running' });
    expect(body).toBe(JSON.stringify({ status: 'running' }));
  });

  it('omits the body when none is given', async () => {
    let body: unknown = 'sentinel';
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      body = init.body;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await apiFetch('GET', '/t');
    expect(body).toBeUndefined();
  });

  it('throws a CodeYangError on a non-2xx response', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'nope' }),
    })) as unknown as typeof fetch;

    await expect(apiFetch('GET', '/missing')).rejects.toThrow(/Bridge API/);
  });

  it('still throws when the error body is not JSON', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;

    await expect(apiFetch('GET', '/boom')).rejects.toThrow(/Bridge API/);
  });
});

describe('claude-agent / saveTaskLocally', () => {
  it('writes the task JSON and returns without error', async () => {
    const task = {
      id: 'task-test-1',
      title: 't',
      description: 'd',
      priority: 'low',
      createdAt: new Date().toISOString(),
    } as unknown as BridgeTask;

    // Writes into the real ~/.codeyang/bridge dir; acceptable for a smoke test.
    await expect(saveTaskLocally(task)).resolves.toBeUndefined();
  });
});

describe('claude-agent / handleLine', () => {
  const originalEnv = { ...process.env };
  const realFetch = globalThis.fetch;
  const realLog = console.log;

  beforeEach(() => {
    process.env['BRIDGE_URL'] = 'http://bridge.test';
    process.env['BRIDGE_TOKEN'] = 'tok';
    console.log = () => {};
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = realFetch;
    console.log = realLog;
  });

  it('recognises all three exit spellings', async () => {
    expect(await handleLine('exit', 't')).toBe('exit');
    expect(await handleLine('quit', 't')).toBe('exit');
    expect(await handleLine('q', 't')).toBe('exit');
  });

  it('tolerates surrounding whitespace', async () => {
    expect(await handleLine('   exit  ', 't')).toBe('exit');
  });

  it('returns noop for unknown input', async () => {
    expect(await handleLine('whatever', 't')).toBe('noop');
    expect(await handleLine('', 't')).toBe('noop');
  });

  it('is case sensitive for commands', async () => {
    expect(await handleLine('EXIT', 't')).toBe('noop');
  });

  it('handles status by reporting server and agents', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: { 'claude-code': true, codex: false }, taskCount: 3 }),
    })) as unknown as typeof fetch;

    expect(await handleLine('status', 't')).toBe('handled');
  });

  it('reports a failed status check without throwing', async () => {
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    expect(await handleLine('status', 't')).toBe('handled');
  });

  it('handles tasks when the list is empty', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    })) as unknown as typeof fetch;

    expect(await handleLine('tasks', 't')).toBe('handled');
  });

  it('handles tasks when the list has entries', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { id: 'abcdef1234567890', status: 'pending', title: 'A' },
        { id: 'zyxwvu0987654321', status: 'running', title: 'B' },
      ],
    })) as unknown as typeof fetch;

    expect(await handleLine('tasks', 't')).toBe('handled');
  });

  it('reports a failed task listing without throwing', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      json: async () => ({ error: 'down' }),
    })) as unknown as typeof fetch;

    expect(await handleLine('tasks', 't')).toBe('handled');
  });

  it('prints help', async () => {
    expect(await handleLine('help', 't')).toBe('handled');
  });
});

describe('claude-agent / handleTask', () => {
  const originalEnv = { ...process.env };
  const realFetch = globalThis.fetch;
  const realLog = console.log;

  beforeEach(() => {
    process.env['BRIDGE_URL'] = 'http://bridge.test';
    process.env['BRIDGE_TOKEN'] = 'tok';
    console.log = () => {};
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = realFetch;
    console.log = realLog;
  });

  it('prints the task and succeeds even when the status update fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('server down');
    }) as unknown as typeof fetch;

    const task = {
      id: 'task-test-2',
      title: 'Demo task',
      description: 'line1\nline2',
      priority: 'high',
      createdAt: '2026-01-01T00:00:00.000Z',
      files: ['a.ts', 'b.ts'],
    } as unknown as BridgeTask;

    // The status PUT is best-effort; handleTask must not reject.
    await expect(handleTask(task)).resolves.toBeUndefined();
  });

  it('handles a task with no files', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const task = {
      id: 'task-test-3',
      title: 'No files',
      description: 'd',
      priority: 'low',
      createdAt: '2026-01-01T00:00:00.000Z',
    } as unknown as BridgeTask;

    await expect(handleTask(task)).resolves.toBeUndefined();
  });
});
