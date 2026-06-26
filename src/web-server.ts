#!/usr/bin/env node
/**
 * CodeYang Web Server — browser-based AI coding agent interface.
 *
 * Usage:
 *   node dist/web-server.js
 *   # then open http://localhost:3456
 *
 * HTTPS:
 *   Set CODEYANG_TLS_CERT and CODEYANG_TLS_KEY to enable HTTPS.
 *   When HTTPS is enabled, HSTS header is automatically added.
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Agent } from './agent/Agent.js';
import { config, loadLocalConfig, setSessionApiKey, getMcpServers } from './agent/config.js';
import { setMcpManager, refreshMcpTools, registerQtTools } from './tools/registry.js';
import { McpManager } from './mcp/McpManager.js';
import { detectQtProject, createQtTools } from './qt/index.js';
import { loadEnvFiles } from './utils/dotenv.js';
import { saveSession } from './utils/sessionStore.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env['CODEYANG_PORT'] || 3456);

// ── HTTPS/TLS configuration ────────────────────
const TLS_CERT_PATH = process.env['CODEYANG_TLS_CERT'] || '';
const TLS_KEY_PATH = process.env['CODEYANG_TLS_KEY'] || '';
const USE_HTTPS = !!(TLS_CERT_PATH && TLS_KEY_PATH);

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
  let currentSessionId: string | undefined;

  // SECURITY: Generate API key and CSRF token
  const API_KEY = process.env['CODEYANG_WEB_API_KEY'] || randomUUID();
  const CSRF_TOKEN = randomUUID();

  if (!process.env['CODEYANG_WEB_API_KEY']) {
    console.log(`\n  🔐 Web API Key (save to CODEYANG_WEB_API_KEY): ${API_KEY}\n`);
  }

  const protocol = USE_HTTPS ? 'https' : 'http';
  console.log(`\n  🌐 CodeYang Web UI: ${protocol}://localhost:${PORT}\n`);

  // SECURITY: Create HTTPS server if TLS certs provided, otherwise HTTP
  const server = USE_HTTPS
    ? createHttpsServer(
        {
          key: readFileSync(TLS_KEY_PATH, 'utf-8'),
          cert: readFileSync(TLS_CERT_PATH, 'utf-8'),
        },
        handleRequest,
      )
    : createHttpServer(handleRequest);

  function handleRequest(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
    // SECURITY: Add HSTS header if HTTPS is active
    if (USE_HTTPS) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // SECURITY: Restrict CORS to localhost only
    const origin = req.headers.origin || '';
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Helper: parse JSON body
    function readBody(): Promise<string> {
      return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk: string) => (body += chunk));
        req.on('end', () => resolve(body));
      });
    }

    // SECURITY: Authentication middleware for API endpoints
    function checkAuth(): boolean {
      if (req.url?.startsWith('/api/')) {
        const authHeader = req.headers['authorization'];
        if (authHeader !== `Bearer ${API_KEY}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized. Provide valid API key in Authorization header.' }));
          return false;
        }
      }
      return true;
    }

    // SECURITY: CSRF protection for POST requests
    function checkCSRF(): boolean {
      if (req.method === 'POST') {
        const csrfHeader = req.headers['x-csrf-token'];
        if (csrfHeader !== CSRF_TOKEN) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid CSRF token' }));
          return false;
        }
      }
      return true;
    }

    // API: Get CSRF token
    if (req.method === 'GET' && req.url === '/api/csrf-token') {
      if (!checkAuth()) return;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: CSRF_TOKEN }));
      return;
    }

    // Apply auth check to all API endpoints
    if (req.url?.startsWith('/api/') && !checkAuth()) {
      return;
    }

    // Apply CSRF check to POST requests
    if (req.method === 'POST' && !checkCSRF()) {
      return;
    }

    // SECURITY: Add security headers to all responses
    const securityHeaders = {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };

    // API: config
    if (req.method === 'GET' && req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...securityHeaders });
      res.end(
        JSON.stringify({
          model: config.model,
          provider: config.provider,
          maxTokens: config.maxTokens,
          version: '0.7.0',
          hasSession: !!currentSessionId,
          sessionId: currentSessionId || null,
        }),
      );
      return;
    }

    // API: history — return full conversation history with tool call details
    if (req.method === 'GET' && req.url === '/api/history') {
      const msgs = agent.exportMessages();
      res.writeHead(200, { 'Content-Type': 'application/json', ...securityHeaders });
      res.end(
        JSON.stringify({
          sessionId: currentSessionId || null,
          messages: msgs,
          messageCount: msgs.length,
        }),
      );
      return;
    }

    // API: new session — reset agent and session
    if (req.method === 'POST' && req.url === '/api/session/new') {
      agent.reset();
      currentSessionId = undefined;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: 'New session started' }));
      return;
    }

    // API: chat
    if (req.method === 'POST' && req.url === '/api/chat') {
      try {
        const { message } = JSON.parse(await readBody());
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

        const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
        const toolResults: Array<{ output: string; isError: boolean }> = [];

        agent.setCallbacks({
          onAgentDelta(text: string) {
            res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
          },
          onToolStart(name: string, args: Record<string, unknown>) {
            toolCalls.push({ name, args });
            const argStr = JSON.stringify(args).slice(0, 200);
            res.write(`data: ${JSON.stringify({ type: 'tool_start', name, args: argStr })}\n\n`);
          },
          onToolResult(name: string, output: string, isError: boolean) {
            toolResults.push({ output, isError });
            const snippet = output.slice(0, 300);
            res.write(`data: ${JSON.stringify({ type: 'tool_result', name, snippet, isError })}\n\n`);
          },
          onError(err: string) {
            res.write(`data: ${JSON.stringify({ type: 'error', text: err })}\n\n`);
          },
        });

        try {
          await agent.run(message);
        } catch (err: unknown) {
          res.write(
            `data: ${JSON.stringify({ type: 'error', text: err instanceof Error ? err.message : String(err) })}\n\n`,
          );
        }

        // Save session after each turn
        try {
          currentSessionId = await saveSession(agent.exportMessages(), currentSessionId);
        } catch {
          // best-effort save
        }

        // Send final summary with full tool details
        res.write(
          `data: ${JSON.stringify({ type: 'done', toolCalls: toolCalls.length, toolResults: toolResults.length, sessionId: currentSessionId })}\n\n`,
        );
        res.end();
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid JSON' }));
      }
      return;
    }

    // WPS integration page
    if (req.url === '/wps') {
      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CodeYang for WPS</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  body{background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;height:100vh;font-size:13px}
  #chat{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
  .msg{padding:6px 10px;border-radius:4px;line-height:1.4;white-space:pre-wrap;font-size:12px}
  .user{background:#1f6feb;align-self:flex-end;max-width:90%}
  .agent{background:#21262d;align-self:flex-start;border:1px solid #30363d;max-width:90%}
  #input-bar{display:flex;gap:4px;padding:6px 8px;background:#161b22;border-top:1px solid #30363d}
  #input{flex:1;padding:6px 8px;border-radius:4px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;font-size:12px;outline:none}
  #input:focus{border-color:#58a6ff}
  #send{padding:4px 12px;border-radius:4px;border:none;background:#238636;color:#fff;cursor:pointer;font-size:12px}
  #send:disabled{opacity:0.5;cursor:default}
  header{padding:6px 8px;background:#161b22;border-bottom:1px solid #30363d;font-size:12px;color:#58a6ff;display:flex;justify-content:space-between}
  .tool-call{font-size:11px;color:#8b949e;padding:2px 8px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spinner{display:inline-block;width:10px;height:10px;border:2px solid #58a6ff;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
</style></head><body>
<header><span>CodeYang AI</span><span id="status" style="color:#8b949e">就绪</span></header>
<div id="chat"></div>
<div id="input-bar">
  <textarea id="input" rows="1" placeholder="输入消息..." style="flex:1;padding:6px 8px;border-radius:4px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;font-size:12px;outline:none;resize:none" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"></textarea>
  <button id="send" onclick="send()" style="padding:4px 12px;border-radius:4px;border:none;background:#238636;color:#fff;cursor:pointer;font-size:12px">发送</button>
</div>
<script>
let loading=false;const chat=document.getElementById('chat'),input=document.getElementById('input'),sendBtn=document.getElementById('send'),statusEl=document.getElementById('status');
async function send(){const msg=input.value.trim();if(!msg||loading)return;input.value='';const d=document.createElement('div');d.className='msg user';d.textContent=msg;chat.appendChild(d);
loading=true;sendBtn.disabled=true;statusEl.textContent='思考中...';const a=document.createElement('div');a.className='msg agent';const s=document.createElement('span');s.className='spinner';a.prepend(s);chat.appendChild(a);
try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg})});const reader=r.body.getReader();let t='',buf='';
while(true){const{done,value}=await reader.read();if(done)break;buf+=new TextDecoder().decode(value,{stream:true});for(const l of buf.split('\\n').filter(Boolean)){if(!l.startsWith('data: '))continue;buf='';
const data=JSON.parse(l.slice(6));if(data.type==='delta'){t+=data.text;a.textContent=t}else if(data.type==='tool_call'){const tc=document.createElement('div');tc.className='tool-call';tc.textContent='>'+(data.name||'');chat.appendChild(tc)}
else if(data.type==='error'){a.textContent+='\\n❌ '+data.text;a.style.borderLeftColor='#f85149'}}}chat.scrollTop=chat.scrollHeight}catch(err){a.textContent+='\\n❌ '+err.message}
s.remove();loading=false;sendBtn.disabled=false;statusEl.textContent='就绪';input.focus()}
</script>
</body></html>`);
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
  }

  server.listen(PORT);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
