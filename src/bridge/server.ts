/**
 * Bridge Server �?HTTP + WebSocket server for CodeYang �?Claude Code communication.
 *
 * Usage (standalone):
 *   npx tsx src/bridge/server.ts
 *
 * Or import and start programmatically:
 *   import { startBridgeServer } from './bridge/server.js';
 *   const server = await startBridgeServer();
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { BridgeTask, BridgeMessage, BridgeConfig, AgentId, WsEvent } from './types.js';
import { logger } from '../utils/logger.js';

// ── Defaults ─────────────────────────────────────────────────────

const BRIDGE_DIR = join(homedir(), '.codeyang', 'bridge');
const TASKS_FILE = join(BRIDGE_DIR, 'tasks.json');
const MESSAGES_FILE = join(BRIDGE_DIR, 'messages.json');
const SHARED_DIR = join(BRIDGE_DIR, 'shared');
const AUTH_TOKEN_FILE = join(BRIDGE_DIR, '.token');

const DEFAULT_PORT = 9876;

// ── State ─────────────────────────────────────────────────────────

interface ServerState {
  tasks: BridgeTask[];
  messages: BridgeMessage[];
  connectedAgents: Map<AgentId, Set<WebSocket>>;
  config: BridgeConfig;
  authToken: string;
}

let state: ServerState;

// ── Persistence ───────────────────────────────────────────────────

async function ensureDirs(): Promise<void> {
  await mkdir(BRIDGE_DIR, { recursive: true });
  await mkdir(SHARED_DIR, { recursive: true });
}

async function loadState(): Promise<void> {
  try {
    const tasksData = await readFile(TASKS_FILE, 'utf-8');
    state.tasks = JSON.parse(tasksData);
  } catch {
    state.tasks = [];
  }
  try {
    const msgsData = await readFile(MESSAGES_FILE, 'utf-8');
    state.messages = JSON.parse(msgsData);
  } catch {
    state.messages = [];
  }
}

async function saveTasks(): Promise<void> {
  await writeFile(TASKS_FILE, JSON.stringify(state.tasks, null, 2));
}

async function saveMessages(): Promise<void> {
  await writeFile(MESSAGES_FILE, JSON.stringify(state.messages, null, 2));
}

/** Generate or load auth token */
async function getAuthToken(): Promise<string> {
  try {
    return (await readFile(AUTH_TOKEN_FILE, 'utf-8')).trim();
  } catch {
    const token = randomBytes(32).toString('hex');
    await writeFile(AUTH_TOKEN_FILE, token);
    return token;
  }
}

// ── Task helpers ──────────────────────────────────────────────────

function createTask(params: {
  from: AgentId;
  to: AgentId;
  title: string;
  description: string;
  priority?: string;
  files?: string[];
  parentId?: string;
  tags?: string[];
}): BridgeTask {
  const now = new Date().toISOString();
  const task: BridgeTask = {
    id: `task_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`,
    from: params.from,
    to: params.to,
    title: params.title,
    description: params.description,
    priority: (['low', 'medium', 'high', 'critical'].includes(params.priority ?? '')
      ? params.priority!
      : 'medium') as BridgeTask['priority'],
    status: 'pending',
    files: params.files,
    parentId: params.parentId,
    tags: params.tags,
    createdAt: now,
    updatedAt: now,
  };
  state.tasks.push(task);
  saveTasks().catch((err) => console.error('Failed to persist tasks:', err));
  return task;
}

function updateTask(id: string, updates: Partial<BridgeTask>): BridgeTask | null {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return null;
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  saveTasks().catch((err) => console.error('Failed to persist tasks:', err));
  return task;
}

function getPendingTasksFor(agent: AgentId): BridgeTask[] {
  return state.tasks.filter((t) => t.to === agent && t.status === 'pending');
}

// ── Message helpers ──────────────────────────────────────────────

function addMessage(msg: Omit<BridgeMessage, 'id' | 'timestamp'>): BridgeMessage {
  const full: BridgeMessage = {
    id: `msg_${Date.now().toString(36)}_${randomUUID().slice(0, 4)}`,
    timestamp: new Date().toISOString(),
    ...msg,
  };
  state.messages.push(full);
  // Keep last 1000 messages in memory, persist all
  if (state.messages.length > 1000) {
    state.messages = state.messages.slice(-500);
  }
  saveMessages().catch((err) => console.error('Failed to persist messages:', err));
  return full;
}

// ── WebSocket broadcast ──────────────────────────────────────────

function broadcast(agent: AgentId, event: WsEvent): void {
  const sockets = state.connectedAgents.get(agent);
  if (!sockets) return;
  const data = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function broadcastAll(event: WsEvent): void {
  for (const agent of state.connectedAgents.keys()) {
    broadcast(agent, event);
  }
}

function notifyNewTask(task: BridgeTask): void {
  broadcast(task.to, {
    type: 'new_task',
    payload: task,
    timestamp: new Date().toISOString(),
  });
}

// ── HTTP request handler ─────────────────────────────────────────

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB limit

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function requireAuth(req: IncomingMessage): boolean {
  const auth = req.headers['authorization'];
  return auth === `Bearer ${state.authToken}`;
}

function handleCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  handleCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  try {
    // ── Health check ────────────────────────────────────────────
    if (path === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        agents: Object.fromEntries(
          Array.from(state.connectedAgents.entries()).map(([id, sockets]) => [id, sockets.size > 0]),
        ),
        taskCount: state.tasks.length,
        messageCount: state.messages.length,
      });
      return;
    }

    // ── Auth required below ─────────────────────────────────────
    if (!requireAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized. Set Authorization: Bearer <token> header.' });
      return;
    }

    // ── Tasks ───────────────────────────────────────────────────
    if (path === '/api/tasks' && req.method === 'GET') {
      const agent = url.searchParams.get('agent') as AgentId | null;
      const status = url.searchParams.get('status');
      let tasks = state.tasks;
      if (agent) tasks = tasks.filter((t) => t.to === agent);
      if (status) tasks = tasks.filter((t) => t.status === status);
      sendJson(res, 200, tasks);
      return;
    }

    if (path === '/api/tasks' && req.method === 'POST') {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const task = createTask({
        from: (body.from as AgentId) || 'codeyang',
        to: (body.to as AgentId) || 'claude-code',
        title: (body.title as string) || 'Untitled task',
        description: (body.description as string) || '',
        priority: body.priority as string,
        files: body.files as string[],
        parentId: body.parentId as string,
        tags: body.tags as string[],
      });
      notifyNewTask(task);
      sendJson(res, 201, task);
      return;
    }

    if (path.startsWith('/api/tasks/') && req.method === 'GET') {
      const taskId = path.slice('/api/tasks/'.length);
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) {
        sendJson(res, 404, { error: 'Task not found' });
        return;
      }
      sendJson(res, 200, task);
      return;
    }

    if (path.startsWith('/api/tasks/') && req.method === 'PUT') {
      const taskId = path.slice('/api/tasks/'.length);
      const body = (await parseBody(req)) as Partial<BridgeTask>;
      const updated = updateTask(taskId, body);
      if (!updated) {
        sendJson(res, 404, { error: 'Task not found' });
        return;
      }
      broadcastAll({
        type: 'task_update',
        payload: updated,
        timestamp: new Date().toISOString(),
      });
      sendJson(res, 200, updated);
      return;
    }

    // ── Messages ────────────────────────────────────────────────
    if (path === '/api/messages' && req.method === 'GET') {
      const agent = url.searchParams.get('agent') as AgentId | null;
      const since = url.searchParams.get('since');
      let msgs = state.messages;
      if (agent) msgs = msgs.filter((m) => m.to === agent);
      if (since) msgs = msgs.filter((m) => m.timestamp > since);
      sendJson(res, 200, msgs);
      return;
    }

    if (path === '/api/messages' && req.method === 'POST') {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const msg = addMessage({
        from: (body.from as AgentId) || 'codeyang',
        to: (body.to as AgentId) || 'claude-code',
        type: (body.type as BridgeMessage['type']) || 'text',
        content: (body.content as string) || '',
        inReplyTo: body.inReplyTo as string,
        taskId: body.taskId as string,
        filePath: body.filePath as string,
      });
      broadcast(msg.to, {
        type: 'new_message',
        payload: msg,
        timestamp: msg.timestamp,
      });
      sendJson(res, 201, msg);
      return;
    }

    // ── Shared files ─────────────────────────────────────────────
    if (path === '/api/shared' && req.method === 'GET') {
      const files = await readdir(SHARED_DIR);
      const fileInfos = await Promise.all(
        files.map(async (name) => {
          const fullPath = join(SHARED_DIR, name);
          try {
            const s = await stat(fullPath);
            return { name, size: s.size, modified: s.mtime.toISOString() };
          } catch {
            return { name, size: 0, modified: '' };
          }
        }),
      );
      sendJson(res, 200, fileInfos);
      return;
    }

    if (path === '/api/shared' && req.method === 'POST') {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const fileName = (body.name as string) || `${Date.now()}.md`;
      const content = (body.content as string) || '';
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = join(SHARED_DIR, safeName);
      await writeFile(filePath, content, 'utf-8');

      // Notify the other agent about the file change
      const target: AgentId = body.to === 'codeyang' ? 'codeyang' : 'claude-code';
      addMessage({
        from: (body.from as AgentId) || 'codeyang',
        to: target,
        type: 'file_change',
        content: `File updated: ${safeName}`,
        filePath: safeName,
      });

      sendJson(res, 201, { name: safeName, path: filePath, size: content.length });
      return;
    }

    if (path.startsWith('/api/shared/') && req.method === 'GET') {
      const fileName = path.slice('/api/shared/'.length);
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = join(SHARED_DIR, safeName);
      if (!existsSync(filePath)) {
        sendJson(res, 404, { error: 'File not found' });
        return;
      }
      const content = await readFile(filePath, 'utf-8');
      sendJson(res, 200, { name: safeName, content });
      return;
    }

    // ── Bridge info ──────────────────────────────────────────────
    if (path === '/api/info') {
      sendJson(res, 200, {
        version: '1.0.0',
        agents: Object.fromEntries(
          Array.from(state.connectedAgents.entries()).map(([id, sockets]) => [id, sockets.size > 0]),
        ),
        sharedDir: SHARED_DIR,
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Request body too large') {
      sendJson(res, 413, { error: 'Request body too large (max 10MB)' });
    } else {
      sendJson(res, 400, { error: msg });
    }
  }
}

// ── WebSocket handler ─────────────────────────────────────────────

function handleWebSocket(ws: WebSocket, req: IncomingMessage): void {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const agentParam = url.searchParams.get('agent') as AgentId | null;
  // 等待客户端发送认证消息，Token 不在 URL 中传递
  let authenticated = false;
  const agent: AgentId = agentParam === 'claude-code' ? 'claude-code' : 'codeyang';

  // 先发送一�?ping 等待认证
  const authTimer = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Authentication timeout');
    }
  }, 10_000); // 10 秒内未认证则断开

  ws.on('message', (raw) => {
    try {
      const event: WsEvent = JSON.parse(raw.toString());

      // ── 认证消息 ──────────────────────────────────────────────
      if (event.type === 'auth') {
        const payload = event.payload as { token?: string };
        if (payload.token === state.authToken) {
          authenticated = true;
          clearTimeout(authTimer);
          onAuthenticated(ws, agent);
        } else {
          ws.close(4001, 'Unauthorized');
        }
        return;
      }

      // ── 未认证的消息全部忽略 ─────────────────────────────────
      if (!authenticated) return;

      event.timestamp = new Date().toISOString();

      switch (event.type) {
        case 'task_update': {
          const taskUpdate = event.payload as Partial<BridgeTask> & { id: string };
          if (taskUpdate.id) {
            const updated = updateTask(taskUpdate.id, taskUpdate);
            if (updated) {
              broadcastAll({ type: 'task_update', payload: updated, timestamp: event.timestamp });
            }
          }
          break;
        }
        case 'new_message': {
          const msgPayload = event.payload as Partial<BridgeMessage>;
          if (msgPayload.content && msgPayload.to) {
            const msg = addMessage({
              from: agent,
              to: msgPayload.to as AgentId,
              type: (msgPayload.type as BridgeMessage['type']) || 'text',
              content: msgPayload.content,
              inReplyTo: msgPayload.inReplyTo,
              taskId: msgPayload.taskId,
              filePath: msgPayload.filePath,
            });
            broadcast(msg.to, { type: 'new_message', payload: msg, timestamp: msg.timestamp });
          }
          break;
        }
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', payload: {}, timestamp: event.timestamp }));
          break;
      }
    } catch {
      logger.warn('Malformed WS message:', raw.toString().slice(0, 200));
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (authenticated) {
      const sockets = state.connectedAgents.get(agent);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) state.connectedAgents.delete(agent);
      }
      logger.info(`[Bridge] ${agent} disconnected`);
      broadcastAll({
        type: 'agent_disconnected',
        payload: { agent, connections: 0 },
        timestamp: new Date().toISOString(),
      });
    }
  });

  ws.on('error', () => {
    clearTimeout(authTimer);
  });
}

/** Called after WebSocket authentication succeeds */
function onAuthenticated(ws: WebSocket, agent: AgentId): void {
  const sockets = state.connectedAgents.get(agent) || new Set();
  sockets.add(ws);
  state.connectedAgents.set(agent, sockets);

  logger.info(`[Bridge] ${agent} connected via WebSocket (${sockets.size} connection(s))`);

  // Notify both agents
  broadcastAll({
    type: 'agent_connected',
    payload: { agent, connections: sockets.size },
    timestamp: new Date().toISOString(),
  });

  // Send any pending tasks immediately
  const pending = getPendingTasksFor(agent);
  for (const task of pending) {
    ws.send(
      JSON.stringify({
        type: 'new_task',
        payload: task,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

// ── Start server ──────────────────────────────────────────────────

export async function startBridgeServer(config?: Partial<BridgeConfig>): Promise<{
  server: ReturnType<typeof createServer>;
  port: number;
  token: string;
  stop: () => Promise<void>;
}> {
  await ensureDirs();

  state = {
    tasks: [],
    messages: [],
    connectedAgents: new Map(),
    config: {
      port: DEFAULT_PORT,
      host: '127.0.0.1',
      sharedDir: SHARED_DIR,
      autoStartClaude: false,
      claudeCommand: 'claude',
      ...config,
    },
    authToken: await getAuthToken(),
  };

  await loadState();

  const server = createServer(handleRequest);
  server.timeout = 120000; // 2 minutes
  const wss = new WebSocketServer({ server });

  wss.on('connection', handleWebSocket);

  const port = state.config.port;

  return new Promise((resolve) => {
    server.listen(port, state.config.host, () => {
      console.log('');
      console.log('  ╔══════════════════════════════════════════╗');
      console.log('  �U     CodeYang ? Claude Code Bridge       �U');
      console.log('  ╠══════════════════════════════════════════╣');
      console.log(`  �? Server:  http://${state.config.host}:${port}      ║`);
      console.log(`  �? WS:      ws://${state.config.host}:${port}        ║`);
      console.log(`  �? Token:   ${state.authToken.slice(0, 16)}...        ║`);
      console.log(`  �? Shared:  ${SHARED_DIR}  ║`);
      console.log('  ╚══════════════════════════════════════════╝');
      console.log('');

      resolve({
        server,
        port,
        token: state.authToken,
        stop: async () => {
          wss.close();
          server.close();
          state.connectedAgents.clear();
          await Promise.resolve();
        },
      });
    });
  });
}

// ── CLI entry point ───────────────────────────────────────────────

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('server.ts');
if (isMain) {
  const port = Number(process.env['BRIDGE_PORT']) || DEFAULT_PORT;
  startBridgeServer({ port }).catch((err) => {
    console.error('Failed to start bridge server:', err);
    process.exit(1);
  });
}
