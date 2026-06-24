#!/usr/bin/env node
/**
 * Claude Code Bridge Agent
 *
 * 在 Claude Code 的终端中运行此脚本，使其连接到桥接服务器，
 * 接收来自 CodeYang 的任务并执行。
 *
 * 使用方式 (在 Claude Code 终端中):
 *   npx tsx src/bridge/claude-agent.ts --token <TOKEN> [--url http://127.0.0.1:9876]
 *
 * 或者通过环境变量:
 *   set BRIDGE_TOKEN=<TOKEN>
 *   npx tsx src/bridge/claude-agent.ts
 *
 * 交互模式:
 *   运行后，此脚本会:
 *   1. 连接到桥接服务器
 *   2. 轮询待处理的任务
 *   3. 每个任务会打印到 stdout，等待用户在 Claude Code 中完成
 *   4. 用户完成后输入结果，脚本将结果发送回桥接服务器
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { WebSocket } from 'ws';
import type { BridgeTask, BridgeMessage, WsEvent } from './types.js';

// ── Config ────────────────────────────────────────────────────────

const BRIDGE_DIR = join(homedir(), '.codeyang', 'bridge');
const TASKS_DIR = join(BRIDGE_DIR, 'claude-tasks');

function getConfig() {
  const url = process.env['BRIDGE_URL'] || 'http://127.0.0.1:9876';
  const token = process.env['BRIDGE_TOKEN'] || '';

  // Parse CLI args
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) {
      process.env['BRIDGE_TOKEN'] = args[i + 1];
      return { url: process.env['BRIDGE_URL'] || url, token: args[i + 1] };
    }
    if (args[i] === '--url' && args[i + 1]) {
      process.env['BRIDGE_URL'] = args[i + 1];
    }
  }

  return { url, token: process.env['BRIDGE_TOKEN'] || token };
}

// ── Helpers ───────────────────────────────────────────────────────

async function apiFetch<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const config = getConfig();
  const url = `${config.url}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || config.token}`,
    },
    signal: AbortSignal.timeout(10000),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`API error (${res.status}): ${err.error || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function print(msg: string): void {
  console.log(`[Bridge] ${msg}`);
}

function printDivider(): void {
  console.log('');
  console.log('  ' + '='.repeat(60));
  console.log('');
}

// ── Task execution ────────────────────────────────────────────────

async function ensureDirs(): Promise<void> {
  await mkdir(TASKS_DIR, { recursive: true });
}

async function saveTaskLocally(task: BridgeTask): Promise<void> {
  await mkdir(TASKS_DIR, { recursive: true });
  const filePath = join(TASKS_DIR, `${task.id}.json`);
  await writeFile(filePath, JSON.stringify(task, null, 2));
}

/**
 * Handle a single task from CodeYang.
 * Prints the task details and waits for user to complete it in Claude Code.
 */
async function handleTask(task: BridgeTask): Promise<void> {
  printDivider();
  print(`📋 NEW TASK FROM CODEYANG`);
  printDivider();
  console.log(`  ID:          ${task.id}`);
  console.log(`  Title:       ${task.title}`);
  console.log(`  Priority:    ${task.priority}`);
  console.log(`  Created:     ${task.createdAt}`);
  console.log('');
  console.log('  Description:');
  console.log(
    '  ' +
      task.description
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n'),
  );
  console.log('');

  if (task.files && task.files.length > 0) {
    console.log('  Related files:');
    for (const f of task.files) {
      console.log(`    - ${f}`);
    }
    console.log('');
  }

  // Mark task as running
  try {
    await apiFetch('PUT', `/api/tasks/${task.id}`, { status: 'running' }, undefined);
    print(`Task ${task.id} marked as running`);
  } catch {
    // Non-critical
  }

  // Save locally for reference
  await saveTaskLocally(task);

  // Print instructions for the user
  console.log('  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │  ✅ This task has been saved to:                         │');
  console.log(`  │     ${join(TASKS_DIR, `${task.id}.json`)}`);
  console.log('  │                                                          │');
  console.log('  │  📝 完成此任务后，输入结果 (多行输入以 Ctrl+Z 结束):    │');
  console.log('  │     or type "skip" to skip, "fail <reason>" to mark as failed │');
  console.log('  └──────────────────────────────────────────────────────────┘');
  console.log('');
}

/**
 * Main loop: keep reading input from the user and
 * polling the bridge server for new tasks.
 */
async function mainLoop(token: string): Promise<void> {
  const config = getConfig();
  print(`Connected to bridge at ${config.url}`);
  print(`Token: ${token.slice(0, 16)}...`);
  print('');
  print('Waiting for tasks from CodeYang...');
  print('(Press Ctrl+C to exit)');
  print('');

  // Current task being worked on
  let currentTask: BridgeTask | null = null;
  let lastPollTime = '';
  let wsReconnectAttempts = 0;
  const WS_MAX_RECONNECT_ATTEMPTS = 10;

  // Health check
  try {
    const health = await apiFetch<{ status: string; agents: Record<string, boolean> }>(
      'GET',
      '/api/health',
      undefined,
      token,
    );
    if (health.status === 'ok') {
      print('Bridge server is healthy');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    print(`⚠ Warning: Bridge server health check failed: ${msg}`);
    print('Will continue trying...');
  }

  // ── WebSocket with auto-reconnect ────────────────────────────────
  let ws: WebSocket | null = null;

  function connectWebSocket(): void {
    try {
      const wsUrl = config.url.replace(/^http/, 'ws') + `?agent=claude-code`;
      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        wsReconnectAttempts = 0;
        print('WebSocket connected (real-time mode)');
        // 连接建立后立即发送认证消息，避免 Token 泄露在 URL 中
        ws!.send(JSON.stringify({ type: 'auth', payload: { token } }));
      });

      ws.on('message', (raw) => {
        try {
          const event: WsEvent = JSON.parse(raw.toString());
          if (event.type === 'new_task') {
            const task = event.payload as BridgeTask;
            print(`Received new task via WebSocket: ${task.title}`);
            void handleTask(task).then(() => {
              currentTask = task;
            });
          } else if (event.type === 'new_message') {
            const msg = event.payload as BridgeMessage;
            print(`📨 Message from CodeYang: ${msg.content.slice(0, 200)}`);
          }
        } catch {
          // ignore
        }
      });

      ws.on('close', () => {
        print('WebSocket disconnected (attempting reconnect...)');
        ws = null;
        // Exponential backoff reconnect
        if (wsReconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 30_000);
          wsReconnectAttempts++;
          print(`Reconnecting in ${delay}ms (attempt ${wsReconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})...`);
          setTimeout(connectWebSocket, delay);
        } else {
          print('WebSocket max reconnect attempts reached, falling back to polling');
        }
      });

      ws.on('error', () => {
        // 'close' event will fire after 'error', so reconnection is handled there
      });
    } catch {
      print('WebSocket connection failed, using polling mode');
    }
  }

  // Initial WebSocket connection
  connectWebSocket();

  // Polling loop (as a fallback or primary if WS fails)
  const pollInterval = 5000; // 5 seconds

  const pollTimer = setInterval(async () => {
    // If we have a current task that's still pending, check its status
    // Or fetch new tasks
    try {
      const since = lastPollTime ? `&since=${lastPollTime}` : '';
      const tasks = await apiFetch<BridgeTask[]>(
        'GET',
        `/api/tasks?agent=claude-code&status=pending${since}`,
        undefined,
        token,
      );
      for (const task of tasks) {
        if (!currentTask || currentTask.id !== task.id) {
          print(`Found pending task: ${task.title}`);
          await handleTask(task);
          currentTask = task;
        }
      }
      if (tasks.length > 0) {
        lastPollTime = new Date().toISOString();
      }
    } catch {
      // Bridge might not be ready yet
    }
  }, pollInterval);

  // Main input loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: '',
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    if (trimmed === 'exit' || trimmed === 'quit' || trimmed === 'q') {
      clearInterval(pollTimer);
      if (ws) ws.close();
      print('Goodbye!');
      process.exit(0);
    }

    if (trimmed === 'status') {
      try {
        const health = await apiFetch<{ status: string; agents: Record<string, boolean>; taskCount: number }>(
          'GET',
          '/api/health',
          undefined,
          token,
        );
        print(`Server: ${health.status}, Tasks: ${health.taskCount}`);
        for (const [agent, connected] of Object.entries(health.agents)) {
          print(`  ${agent}: ${connected ? 'online' : 'offline'}`);
        }
      } catch (err) {
        print(`Status check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (trimmed === 'tasks') {
      try {
        const tasks = await apiFetch<BridgeTask[]>('GET', '/api/tasks?agent=claude-code', undefined, token);
        if (tasks.length === 0) {
          print('No tasks');
        } else {
          for (const t of tasks) {
            print(`[${t.status}] ${t.id.slice(-8)}: ${t.title}`);
          }
        }
      } catch (err) {
        print(`Failed to list tasks: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (trimmed === 'help') {
      print('Commands:');
      print('  status          — Check bridge server status');
      print('  tasks           — List all tasks from CodeYang');
      print('  exit/quit/q     — Disconnect and exit');
      print('  help            — Show this help');
      print('');
      print('When a task is received, complete it in Claude Code,');
      print('then type your result and press Ctrl+Z to submit.');
      return;
    }
  });

  // Keep alive
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', payload: {}, timestamp: new Date().toISOString() }));
    }
  }, 30_000);
}

// ── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   Claude Code Bridge Agent               ║');
  console.log('  ║   Connected to: CodeYang                  ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  const config = getConfig();

  if (!config.token) {
    console.error('Error: BRIDGE_TOKEN is not set.');
    console.error('');
    console.error('Run the bridge server first:');
    console.error('  npx tsx src/bridge/server.ts');
    console.error('');
    console.error('Then run this agent with the token:');
    console.error('  npx tsx src/bridge/claude-agent.ts --token <TOKEN>');
    console.error('  or set BRIDGE_TOKEN=<TOKEN>');
    process.exit(1);
  }

  await ensureDirs();
  await mainLoop(config.token);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
