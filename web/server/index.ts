/**
 * CodeYang Web Server — WebSocket bridge to a local Agent.
 *
 * ── SECURITY MODEL ──
 * This process can execute arbitrary local commands through the agent's tools,
 * so it is treated as a privileged endpoint, not a dev convenience:
 *
 *   1. **Loopback by default.** `listen(PORT)` with no host binds 0.0.0.0, which
 *      put an unauthenticated remote-code-execution endpoint on the LAN. The
 *      default host is now 127.0.0.1; exposing it elsewhere is an explicit
 *      opt-in via `CODEYANG_WEB_HOST`.
 *   2. **Token required on every request.** Both the HTTP handler and the
 *      WebSocket handshake demand a shared secret (constant-time compared).
 *      When `CODEYANG_WEB_TOKEN` is unset an ephemeral token is generated and
 *      printed once at startup — binding to loopback is what makes that safe,
 *      and generating one keeps `npm run web:server` usable out of the box.
 *   3. **Bounded input and concurrency.** `maxPayload` caps a single frame, and
 *      the session table is capped so one peer cannot exhaust memory by opening
 *      connections in a loop.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Agent } from '../../src/agent/Agent.js';
import { config, loadLocalConfig, setSessionApiKey } from '../../src/agent/config.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

/** Loopback unless explicitly overridden. See SECURITY MODEL note 1. */
const HOST = process.env['CODEYANG_WEB_HOST'] || '127.0.0.1';

/** Max size of a single WebSocket frame (1 MiB) — a prompt is never larger. */
const MAX_WS_PAYLOAD = 1 << 20;

/** Max concurrent agent sessions. Each one holds an Agent + its transcript. */
const MAX_SESSIONS = 8;

/**
 * Shared secret for every request. Generated when the env var is absent, and
 * printed to the console so the operator can copy it into the client.
 */
const AUTH_TOKEN = (() => {
  const fromEnv = (process.env['CODEYANG_WEB_TOKEN'] || '').trim();
  if (fromEnv) return fromEnv;

  const generated = randomBytes(32).toString('base64url');
  console.log('[Server] CODEYANG_WEB_TOKEN is not set — generated an ephemeral token for this run.');
  console.log(`[Server] Token: ${generated}`);
  console.log('[Server] Pass it as ?token=<token> or an "Authorization: Bearer <token>" header.');
  return generated;
})();

/** Constant-time token comparison. Length mismatch returns false without leaking timing. */
function tokenMatches(candidate: string): boolean {
  const given = Buffer.from(candidate ?? '', 'utf8');
  const expected = Buffer.from(AUTH_TOKEN, 'utf8');
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** Pull the token from the Authorization header or the `token` query parameter. */
function extractToken(req: IncomingMessage): string {
  const header = req.headers['authorization'];
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1].trim();
  }
  try {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    return url.searchParams.get('token') ?? '';
  } catch {
    return '';
  }
}

const httpServer = createServer((req, res) => {
  // The handler used to answer every request with 200 and a banner, which
  // confirmed the endpoint's existence before any authentication happened.
  if (!tokenMatches(extractToken(req))) {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('401 Unauthorized — a valid token is required (?token=… or Authorization: Bearer …).\n');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>CodeYang Web</title>
        <meta charset="utf-8">
      </head>
      <body>
        <h1>CodeYang Web Server</h1>
        <p>WebSocket server running on ${HOST}:${PORT}</p>
        <p>Connect your client to: ws://${HOST}:${PORT}?token=&lt;token&gt;</p>
      </body>
    </html>
  `);
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_WS_PAYLOAD,
  // Reject the handshake before a socket or an Agent is ever allocated.
  verifyClient: (info, done) => {
    if (tokenMatches(extractToken(info.req))) {
      done(true);
      return;
    }
    done(false, 401, 'Unauthorized');
  },
});

interface ClientSession {
  agent: Agent;
  ws: WebSocket;
  /** True while `agent.run()` is in flight — one prompt at a time per socket. */
  busy: boolean;
}

const sessions = new Map<WebSocket, ClientSession>();

wss.on('connection', (ws: WebSocket) => {
  if (sessions.size >= MAX_SESSIONS) {
    safeSend(ws, { type: 'error', error: `Too many concurrent sessions (max ${MAX_SESSIONS}).` });
    ws.close(1013, 'Too many connections');
    return;
  }

  console.log('[WebSocket] Client connected');

  const agent = new Agent();
  const session: ClientSession = { agent, ws, busy: false };

  agent.setCallbacks({
    onAgentText(text) {
      safeSend(ws, { type: 'assistant_text', text });
    },
    onAgentDelta(text) {
      safeSend(ws, { type: 'assistant_delta', text });
    },
    onToolBatch(total) {
      safeSend(ws, { type: 'tool_batch', total });
    },
    onToolStart(name, args) {
      safeSend(ws, { type: 'tool_call', toolName: name, args });
    },
    onToolResult(name, output, isError) {
      safeSend(ws, { type: 'tool_result', toolName: name, result: output, isError });
    },
    onQuestion(q, options) {
      safeSend(ws, { type: 'question', question: q, options });
    },
    onError(err) {
      console.error('[Agent] Error:', err);
      safeSend(ws, { type: 'error', error: err });
    },
  });

  sessions.set(ws, session);

  safeSend(ws, { type: 'connected', message: 'Connected to CodeYang Web Server' });

  ws.on('message', async (data: Buffer | string) => {
    try {
      const raw = data.toString();
      if (raw.length > MAX_WS_PAYLOAD) {
        safeSend(ws, { type: 'error', error: 'Message too large' });
        return;
      }

      const message = JSON.parse(raw);
      const current = sessions.get(ws);

      if (!current) {
        safeSend(ws, { type: 'error', error: 'Session not found' });
        return;
      }

      switch (message.type) {
        case 'prompt': {
          const prompt = message.prompt || '';
          if (typeof prompt !== 'string' || !prompt.trim()) {
            safeSend(ws, { type: 'error', error: 'Invalid prompt' });
            return;
          }
          // Serialise runs: two concurrent `agent.run()` calls share one
          // transcript and corrupt each other's state.
          if (current.busy) {
            safeSend(ws, { type: 'error', error: 'A prompt is already running on this session.' });
            return;
          }

          current.busy = true;
          safeSend(ws, { type: 'status', status: 'processing' });

          try {
            const startTime = Date.now();
            await current.agent.run(prompt);
            console.log('[Agent] Completed in', Date.now() - startTime + 'ms');
            safeSend(ws, { type: 'status', status: 'completed' });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('[Agent] Run failed:', errMsg);
            safeSend(ws, { type: 'error', error: errMsg });
            safeSend(ws, { type: 'status', status: 'error' });
          } finally {
            current.busy = false;
          }
          break;
        }

        case 'cancel': {
          current.agent.cancelQuestion();
          safeSend(ws, { type: 'status', status: 'cancelled' });
          break;
        }

        case 'reset': {
          if (current.busy) {
            safeSend(ws, { type: 'error', error: 'Cannot reset while a prompt is running.' });
            return;
          }
          current.agent.reset();
          safeSend(ws, { type: 'status', status: 'reset' });
          break;
        }

        default:
          safeSend(ws, { type: 'error', error: `Unknown message type: ${String(message.type)}` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[WebSocket] Parse error:', errMsg);
      safeSend(ws, { type: 'error', error: `Failed: ${errMsg}` });
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    sessions.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Connection error:', err.message);
    sessions.delete(ws);
  });
});

function safeSend(ws: WebSocket, data: unknown) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {
    // ignore send errors
  }
}

async function start() {
  await loadLocalConfig();
  const apiKey = config.apiKey || process.env['CODEYANG_API_KEY'] || process.env['DEEPSEEK_API_KEY'] || '';
  if (!apiKey) {
    console.error('[Server] No API key found. Set CODEYANG_API_KEY or DEEPSEEK_API_KEY env var.');
    process.exit(1);
  }
  setSessionApiKey(apiKey);

  // Use DeepSeek API directly (local proxy may not be running)
  const baseURL = config.baseURL || process.env['CODEYANG_BASE_URL'] || 'https://api.deepseek.com/v1';
  process.env['CODEYANG_BASE_URL'] = baseURL;

  httpServer.listen(PORT, HOST, () => {
    console.log(`[Server] HTTP: http://${HOST}:${PORT}`);
    console.log(`[Server] WS:   ws://${HOST}:${PORT}?token=<token>`);
    console.log(`[Server] Model: ${config.model}`);
    console.log(`[Server] URL:   ${baseURL}`);
    console.log(`[Server] Key:   ${config.apiKey ? 'SET (len=' + config.apiKey.length + ')' : 'EMPTY'}`);
    if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
      console.warn(
        `[Server] ⚠️  Bound to ${HOST} (not loopback) — anyone who can reach this port and knows the token can run commands locally.`,
      );
    }
  });
}

start().catch((err) => {
  console.error('[Server] Fatal:', err);
  process.exit(1);
});
