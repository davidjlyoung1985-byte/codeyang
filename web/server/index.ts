import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { Agent } from '../../src/agent/Agent.js';
import type { ToolCall, ToolResult } from '../../src/types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// HTTP server for serving static files
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

// WebSocket server
const wss = new WebSocketServer({ server: httpServer });

interface ClientSession {
  agent: Agent;
  ws: WebSocket;
}

const sessions = new Map<WebSocket, ClientSession>();

wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] Client connected');

  // Create agent instance for this session
  const agent = new Agent({
    model: 'claude-opus-4',
    systemPrompt: 'You are CodeYang, an AI coding assistant.',
    onToolCall: (toolName: string) => {
      ws.send(JSON.stringify({ type: 'tool_call', toolName }));
    },
    onToolResult: (toolName: string, result: string) => {
      ws.send(JSON.stringify({ type: 'tool_result', toolName, result }));
    },
    onText: (text: string) => {
      ws.send(JSON.stringify({ type: 'assistant_text', text }));
    },
    onToolBatch: (count: number) => {
      ws.send(JSON.stringify({ type: 'tool_batch', count }));
    },
  });

  sessions.set(ws, { agent, ws });

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      const session = sessions.get(ws);

      if (!session) {
        ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
        return;
      }

      switch (message.type) {
        case 'prompt': {
          // User sent a prompt
          const { prompt } = message;
          if (typeof prompt !== 'string') {
            ws.send(JSON.stringify({ type: 'error', error: 'Invalid prompt' }));
            return;
          }

          ws.send(JSON.stringify({ type: 'status', status: 'processing' }));

          try {
            await session.agent.run(prompt);
            ws.send(JSON.stringify({ type: 'status', status: 'completed' }));
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            ws.send(JSON.stringify({ type: 'error', error: errMsg }));
          }
          break;
        }

        case 'cancel': {
          // User wants to cancel current execution
          session.agent.cancelExecution();
          ws.send(JSON.stringify({ type: 'status', status: 'cancelled' }));
          break;
        }

        case 'reset': {
          // Reset conversation history
          session.agent.reset();
          ws.send(JSON.stringify({ type: 'status', status: 'reset' }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${message.type}` }));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ws.send(JSON.stringify({ type: 'error', error: `Failed to parse message: ${errMsg}` }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    sessions.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err);
    sessions.delete(ws);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to CodeYang Web Server' }));
});

httpServer.listen(PORT, () => {
  console.log(`[Server] HTTP server running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket server running on ws://localhost:${PORT}`);
});
