#!/usr/bin/env node
/**
 * CodeYang Web Server — browser-based AI coding agent interface.
 *
 * Usage:
 *   node dist/web-server.js
 *   # then open http://localhost:3456
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from './agent/Agent.js';
import { config, loadLocalConfig, setSessionApiKey, getMcpServers } from './agent/config.js';
import { setMcpManager, refreshMcpTools, registerQtTools } from './tools/registry.js';
import { McpManager } from './mcp/McpManager.js';
import { detectQtProject, createQtTools } from './qt/index.js';
import { loadEnvFiles } from './utils/dotenv.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env['CODEYANG_PORT'] || 3456);

// ── Static files ──────────────────────────────
// web-ui is at project root; resolve via package location or CWD
const PROJECT_ROOT = join(__dirname, '..');
const WEB_UI_DIR = join(PROJECT_ROOT, 'web-ui');

function serveStatic(url: string) {
  const filePath = url === '/' ? '/index.html' : url;
  const abs = join(WEB_UI_DIR, filePath);
  if (!existsSync(abs)) return null;
  const ext = extname(abs);
  const mimes: Record<string, string> = {
    '.html': 'text/html;charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  return { data: readFileSync(abs), type: mimes[ext] || 'text/plain' };
}

// ── Agent setup ────────────────────────────────
async function initAgent(): Promise<Agent> {
  loadEnvFiles();
  await loadLocalConfig();

  const key = config.apiKey;
  if (!key) {
    console.error('No API key configured. Set CODEYANG_API_KEY or DEEPSEEK_API_KEY.');
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

  const agent = new Agent(qtContext);
  agent.setCallbacks({});
  return agent;
}

// ── HTTP server ────────────────────────────────
async function main() {
  const agent = await initAgent();
  console.log(`\n  🌐 CodeYang Web UI: http://localhost:${PORT}\n`);

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // API: chat
    if (req.method === 'POST' && req.url === '/api/chat') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body);
          if (!message) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'message required' }));
            return;
          }

          // Stream response via SSE
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          let fullText = '';
          agent.setCallbacks({
            onAgentDelta(text: string) {
              fullText += text;
              res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
            },
            onToolStart(name: string, args: Record<string, unknown>) {
              res.write(`data: ${JSON.stringify({ type: 'tool_start', name, args })}\n\n`);
            },
            onToolResult(name: string, output: string, isError: boolean) {
              const snippet = output.slice(0, 200);
              res.write(`data: ${JSON.stringify({ type: 'tool_result', name, snippet, isError })}\n\n`);
            },
            onError(err: string) {
              res.write(`data: ${JSON.stringify({ type: 'error', text: err })}\n\n`);
            },
          });

          try {
            await agent.run(message);
          } catch (err: any) {
            res.write(`data: ${JSON.stringify({ type: 'error', text: err.message })}\n\n`);
          }

          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'invalid JSON' }));
        }
      });
      return;
    }

    // API: config
    if (req.method === 'GET' && req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        model: config.model,
        provider: config.provider,
        maxTokens: config.maxTokens,
        version: '0.7.0',
      }));
      return;
    }

    // Static files
    const file = serveStatic(req.url || '/');
    if (file) {
      res.writeHead(200, { 'Content-Type': file.type });
      res.end(file.data);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(PORT);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
