import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { Agent } from '../../src/agent/Agent.js';
import { config, loadLocalConfig, setSessionApiKey, getMcpServers } from '../../src/agent/config.js';
import { setMcpManager, refreshMcpTools, registerQtTools } from '../../src/tools/registry.js';
import { McpManager } from '../../src/mcp/McpManager.js';
import { createLLMClient } from '../../src/agent/LLMClient.js';
import { detectQtProject, createQtTools } from '../../src/qt/index.js';
import { loadEnvFiles } from '../../src/utils/dotenv.js';

const PORT = Number(process.env['PORT'] || 3000);

async function init() {
  loadEnvFiles();
  await loadLocalConfig();

  const key = config.apiKey;
  if (!key) {
    console.error('[Server] No API key configured. Set CODEYANG_API_KEY or DEEPSEEK_API_KEY.');
    process.exit(1);
  }
  setSessionApiKey(key);

  const mcpMgr = new McpManager();
  const mcpServers = getMcpServers();
  if (Object.keys(mcpServers).length > 0) {
    mcpMgr.configure(mcpServers);
    await mcpMgr.initialize(() => {});
    setMcpManager(mcpMgr);
    await refreshMcpTools();
  } else {
    setMcpManager(null);
  }

  const qtContext = await detectQtProject(process.cwd());
  if (qtContext.isQtProject) registerQtTools(createQtTools(qtContext));
  return qtContext;
}

// HTTP server for health check
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html><html><head><title>CodeYang Web</title><meta charset="utf-8"></head><body>
    <h1>CodeYang Web Server</h1>
    <p>WebSocket: ws://localhost:${PORT}</p>
    <p>Client: <a href="http://localhost:5173">http://localhost:5173</a></p>
  </body></html>`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', async (ws: WebSocket) => {
  console.log('[WebSocket] Client connected');

  const agent = new Agent();
  let isRunning = false;

  agent.setCallbacks({
    onAgentDelta(text: string) {
      ws.send(JSON.stringify({ type: 'assistant_text', text }));
    },
    onToolStart(name: string) {
      ws.send(JSON.stringify({ type: 'tool_call', toolName: name }));
    },
    onToolResult(_name: string, _output: string) {
      // Optionally send result
    },
    onError(err: string) {
      ws.send(JSON.stringify({ type: 'error', error: err }));
    },
  });

  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to CodeYang Web Server' }));

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('[WebSocket] Message:', msg.type);

      switch (msg.type) {
        case 'prompt': {
          if (isRunning) return;
          isRunning = true;
          ws.send(JSON.stringify({ type: 'status', status: 'processing' }));
          try {
            await agent.run(msg.prompt);
            ws.send(JSON.stringify({ type: 'status', status: 'completed' }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          }
          isRunning = false;
          break;
        }
        case 'cancel': {
          agent.cancelQuestion();
          ws.send(JSON.stringify({ type: 'status', status: 'cancelled' }));
          isRunning = false;
          break;
        }
        case 'reset': {
          agent.reset();
          ws.send(JSON.stringify({ type: 'status', status: 'reset' }));
          break;
        }
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'error', error: `Parse error: ${err.message}` }));
    }
  });

  ws.on('close', () => console.log('[WebSocket] Client disconnected'));
  ws.on('error', () => {});
});

httpServer.listen(PORT, () => {
  console.log(`[Server] HTTP: http://localhost:${PORT}`);
  console.log(`[Server] WebSocket: ws://localhost:${PORT}`);
  console.log(`[Server] Client: http://localhost:5173 (npm run web:client)`);
});

init().catch((err) => {
  console.error('[Server] Init failed:', err);
  process.exit(1);
});
