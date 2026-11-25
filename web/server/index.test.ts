/**
 * Tests for the web bridge's authentication gate.
 *
 * The server used to accept any WebSocket connection and run whatever prompt
 * arrived, so anyone who could reach the port could execute local commands.
 * These tests pin the two invariants that closed it:
 *
 *   1. the handshake is rejected without a valid token;
 *   2. the default bind address is loopback.
 *
 * The suite starts the real server as a child process rather than importing it,
 * because the module reads its token at import time and calls `listen()` on
 * load. A fake network is unnecessary — everything here is loopback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import WebSocket from 'ws';

/** Grab a free TCP port by binding to port 0 and reading what the OS picked. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

let child: ChildProcess;
let port: number;
const TOKEN = `test-token-${randomUUID()}`;

beforeAll(async () => {
  port = await freePort();

  child = spawn(process.execPath, ['--import', 'tsx', 'web/server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CODEYANG_WEB_TOKEN: TOKEN,
      // Any non-empty value satisfies the startup check; no request is made.
      CODEYANG_API_KEY: 'test-key-not-used',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in time')), 20_000);
    const onData = (buf: Buffer): void => {
      if (buf.toString().includes('[Server] HTTP:')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}`));
    });
  });
}, 30_000);

afterAll(() => {
  child?.kill();
});

/** Resolve with the upgrade outcome instead of throwing. */
async function attemptWs(url: string): Promise<{ ok: true } | { ok: false; status?: number }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const done = (v: { ok: true } | { ok: false; status?: number }): void => {
      ws.removeAllListeners();
      ws.on('error', () => {});
      resolve(v);
    };
    ws.on('open', () => {
      ws.close();
      done({ ok: true });
    });
    ws.on('unexpected-response', (_req, res) => {
      done({ ok: false, status: res.statusCode });
    });
    ws.on('error', () => done({ ok: false }));
  });
}

describe('web server authentication', () => {
  it('rejects a WebSocket handshake with no token', async () => {
    const result = await attemptWs(`ws://127.0.0.1:${port}`);

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('status', 401);
  });

  it('rejects a WebSocket handshake with a wrong token', async () => {
    const result = await attemptWs(`ws://127.0.0.1:${port}?token=wrong-token`);

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('status', 401);
  });

  it('accepts a WebSocket handshake with the right token', async () => {
    const result = await attemptWs(`ws://127.0.0.1:${port}?token=${TOKEN}`);

    expect(result.ok).toBe(true);
  });

  it('rejects an unauthenticated HTTP request', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);

    expect(res.status).toBe(401);
  });

  it('serves the banner once authenticated', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/?token=${TOKEN}`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('CodeYang Web Server');
  });
});
