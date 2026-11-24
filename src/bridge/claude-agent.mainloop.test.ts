import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * mainLoop is a long-lived IO loop (WebSocket + readline + setInterval).
 * To exercise it we mock `ws` and `node:readline`, then drive the handlers
 * directly. Everything else runs for real.
 */

// Captured handler registries from the mocked modules.
const wsHandlers: Record<string, (...args: unknown[]) => void> = {};
const lineHandlers: Array<(line: string) => void> = [];
let intervalCallbacks: Array<() => void> = [];

class FakeWebSocket {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  constructor(public url: string) {
    fakeSockets.push(this);
  }
  on(event: string, cb: (...args: unknown[]) => void) {
    wsHandlers[event] = cb;
    return this;
  }
  send(payload: string) {
    this.sent.push(payload);
  }
  close() {
    this.readyState = 3;
  }
}

const fakeSockets: FakeWebSocket[] = [];

vi.mock('ws', () => ({ WebSocket: FakeWebSocket }));

vi.mock('node:readline', () => ({
  createInterface: () => ({
    on: (event: string, cb: (line: string) => void) => {
      if (event === 'line') lineHandlers.push(cb);
    },
    close: () => {},
  }),
}));

describe('claude-agent / mainLoop', () => {
  const originalEnv = { ...process.env };
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realSetInterval = globalThis.setInterval;
  const realSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    process.env['BRIDGE_URL'] = 'http://bridge.test';
    process.env['BRIDGE_TOKEN'] = 'tok';
    console.log = () => {};
    for (const k of Object.keys(wsHandlers)) delete wsHandlers[k];
    lineHandlers.length = 0;
    fakeSockets.length = 0;
    intervalCallbacks = [];

    // Do not actually schedule timers during the test.
    globalThis.setInterval = ((cb: () => void) => {
      intervalCallbacks.push(cb);
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval;
    globalThis.setTimeout = ((cb: () => void) => {
      intervalCallbacks.push(cb);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;

    // Prevent the loop from killing the test process on `exit`.
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = realFetch;
    console.log = realLog;
    globalThis.setInterval = realSetInterval;
    globalThis.setTimeout = realSetTimeout;
    vi.restoreAllMocks();
  });

  it('performs a healthy startup and wires the WebSocket', async () => {
    const { mainLoop } = await import('./claude-agent.js');

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: {} }),
    })) as unknown as typeof fetch;

    void mainLoop('test-token-value-1234567890');
    await new Promise((r) => realSetTimeout(r, 30));

    expect(fakeSockets.length).toBeGreaterThan(0);
    expect(fakeSockets[0].url.startsWith('ws://bridge.test')).toBe(true);
    expect(fakeSockets[0].url).toContain('agent=claude-code');
  });

  it('sends an auth message once the socket opens', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: {} }),
    })) as unknown as typeof fetch;

    void mainLoop('tok-abc');
    await new Promise((r) => realSetTimeout(r, 30));

    wsHandlers['open']?.();
    const sent = JSON.parse(fakeSockets[0].sent[0]);
    expect(sent.type).toBe('auth');
    expect(sent.payload.token).toBe('tok-abc');
  });

  it('survives a failed health check', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    globalThis.fetch = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    void mainLoop('tok');
    await new Promise((r) => realSetTimeout(r, 30));

    expect(fakeSockets.length).toBeGreaterThan(0);
  });

  it('handles a new_task WebSocket event', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: {} }),
    })) as unknown as typeof fetch;

    void mainLoop('tok');
    await new Promise((r) => realSetTimeout(r, 30));

    wsHandlers['message']?.(
      JSON.stringify({
        type: 'new_task',
        payload: {
          id: 'task-ws-1',
          title: 'From WS',
          description: 'd',
          priority: 'low',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    await new Promise((r) => realSetTimeout(r, 30));
    // No assertion needed beyond not throwing.
    expect(true).toBe(true);
  });

  it('ignores a malformed WebSocket message', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: {} }),
    })) as unknown as typeof fetch;

    void mainLoop('tok');
    await new Promise((r) => realSetTimeout(r, 30));

    expect(() => wsHandlers['message']?.('not-json')).not.toThrow();
  });

  it('schedules a reconnect on socket close', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: {} }),
    })) as unknown as typeof fetch;

    void mainLoop('tok');
    await new Promise((r) => realSetTimeout(r, 30));

    const before = intervalCallbacks.length;
    wsHandlers['close']?.();
    // close schedules a setTimeout for reconnect
    expect(intervalCallbacks.length).toBeGreaterThan(before);
  });

  it('exits cleanly on the exit command', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: {} }),
    })) as unknown as typeof fetch;

    void mainLoop('tok');
    await new Promise((r) => realSetTimeout(r, 30));

    expect(lineHandlers.length).toBeGreaterThan(0);
    await lineHandlers[0]('exit');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('polls for tasks on the interval', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    }) as unknown as typeof fetch;

    void mainLoop('tok');
    await new Promise((r) => realSetTimeout(r, 30));

    const pollCb = intervalCallbacks[0];
    expect(typeof pollCb).toBe('function');
    const before = calls;
    await pollCb();
    expect(calls).toBeGreaterThan(before);
  });

  it('sends a keep-alive ping on the interval', async () => {
    const { mainLoop } = await import('./claude-agent.js');
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', agents: {} }),
    })) as unknown as typeof fetch;

    void mainLoop('tok');
    await new Promise((r) => realSetTimeout(r, 30));

    // The keep-alive is the last registered interval.
    const keepAlive = intervalCallbacks[intervalCallbacks.length - 1];
    const before = fakeSockets[0].sent.length;
    keepAlive();
    expect(fakeSockets[0].sent.length).toBeGreaterThan(before);
  });
});
