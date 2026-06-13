import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { Agent } from '../../src/agent/Agent.js';
import { config, loadLocalConfig, setSessionApiKey } from '../../src/agent/config.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>CodeYang Web</title>
        <meta charset="utf-8">
      </head>
      <body>
        <h1>CodeYang Web Server</h1>
        <p>WebSocket server running on port ${PORT}</p>
        <p>Connect your client to: ws://localhost:${PORT}</p>
      </body>
    </html>
  `);
});

const wss = new WebSocketServer({ server: httpServer });

interface ClientSession {
  agent: Agent;
  ws: WebSocket;
}

const sessions = new Map<WebSocket, ClientSession>();

wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] Client connected');

  const agent = new Agent();

  agent.setCallbacks({
    onAgentText(text) {
      console.log('[Agent] TEXT CALLBACK:', JSON.stringify(text).slice(0, 200));
      safeSend(ws, { type: 'assistant_text', text });
    },
    onAgentDelta(text) {
      console.log('[Agent] DELTA:', JSON.stringify(text));
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

  sessions.set(ws, { agent, ws });

  safeSend(ws, { type: 'connected', message: 'Connected to CodeYang Web Server' });

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[WebSocket] Received:', message.type);
      const session = sessions.get(ws);

      if (!session) {
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

          safeSend(ws, { type: 'status', status: 'processing' });

          try {
            console.log('[Agent] Running prompt:', prompt.slice(0, 100));
            console.log('[Agent] Model:', config.model);
            console.log('[Agent] BaseURL:', config.baseURL);
            const startTime = Date.now();
            await session.agent.run(prompt);
            const elapsed = Date.now() - startTime;
            console.log('[Agent] Completed in', elapsed + 'ms');
            safeSend(ws, { type: 'status', status: 'completed' });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('[Agent] Run failed:', errMsg);
            if (err instanceof Error && err.stack) {
              console.error('[Agent] Stack:', err.stack.split('\n').slice(0, 5).join('\n'));
            }
            safeSend(ws, { type: 'error', error: errMsg });
            safeSend(ws, { type: 'status', status: 'error' });
          }
          break;
        }

        case 'cancel': {
          agent.cancelQuestion();
          safeSend(ws, { type: 'status', status: 'cancelled' });
          break;
        }

        case 'reset': {
          agent.reset();
          safeSend(ws, { type: 'status', status: 'reset' });
          break;
        }

        default:
          safeSend(ws, { type: 'error', error: `Unknown message type: ${message.type}` });
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

  httpServer.listen(PORT, () => {
    console.log(`[Server] HTTP: http://localhost:${PORT}`);
    console.log(`[Server] WS:   ws://localhost:${PORT}`);
    console.log(`[Server] Model: ${config.model}`);
    console.log(`[Server] URL:   ${baseURL}`);
    console.log(`[Server] Key:   ${config.apiKey ? 'SET (len=' + config.apiKey.length + ')' : 'EMPTY'}`);
  });
}

start().catch((err) => {
  console.error('[Server] Fatal:', err);
  process.exit(1);
});
