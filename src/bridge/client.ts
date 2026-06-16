/**
 * Bridge Client — used by CodeYang to communicate with Claude Code.
 *
 * Provides functions to:
 * - Send tasks to Claude Code
 * - Check task status
 * - Send messages
 * - Read shared files
 * - Write shared files
 * - Wait for results
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { BridgeTask, BridgeMessage, AgentId } from './types.js';

// ── Configuration ─────────────────────────────────────────────────

const BRIDGE_DIR = join(homedir(), '.codeyang', 'bridge');
const CONFIG_FILE = join(BRIDGE_DIR, 'config.json');

interface BridgeConnectionConfig {
  serverUrl: string;
  token: string;
}

let cachedConfig: BridgeConnectionConfig | null = null;

async function loadConfig(): Promise<BridgeConnectionConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    cachedConfig = JSON.parse(data);
    return cachedConfig!;
  } catch {
    // Try environment variables
    const url = process.env['BRIDGE_URL'] || 'http://127.0.0.1:9876';
    const token = process.env['BRIDGE_TOKEN'] || '';
    if (!token) {
      throw new Error(
        'Bridge not configured. Run the bridge server first, then set BRIDGE_TOKEN.\n' +
          '  npx tsx src/bridge/server.ts\n' +
          '  Then copy the token and set BRIDGE_TOKEN=<token>',
      );
    }
    return { serverUrl: url, token };
  }
}

async function saveConfig(config: BridgeConnectionConfig): Promise<void> {
  await mkdir(BRIDGE_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  cachedConfig = config;
}

// ── HTTP helpers ──────────────────────────────────────────────────

async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const config = await loadConfig();
  const url = `${config.serverUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.token}`,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Bridge API error (${res.status}): ${errData.error || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Configure the bridge connection.
 * Call this once at startup with the bridge server URL and token.
 */
export async function configureBridge(serverUrl: string, token: string): Promise<void> {
  await saveConfig({ serverUrl, token });
}

/**
 * Check if the bridge server is running and get status.
 */
export async function checkBridgeHealth(): Promise<{
  status: string;
  agents: Record<string, boolean>;
  taskCount: number;
} | null> {
  try {
    const config = await loadConfig();
    const res = await fetch(`${config.serverUrl}/api/health`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Send a task to Claude Code.
 *
 * @param title - Short task title
 * @param description - Detailed task description
 * @param options - Optional: priority, files, tags, waitForResult
 * @returns The created task
 */
export async function sendTaskToClaude(
  title: string,
  description: string,
  options?: {
    priority?: string;
    files?: string[];
    tags?: string[];
    parentId?: string;
    /** If true, polls until the task completes */
    waitForResult?: boolean;
    /** Polling timeout in ms (default: 5 min) */
    waitTimeout?: number;
  },
): Promise<BridgeTask> {
  const task = await apiFetch<BridgeTask>('POST', '/api/tasks', {
    from: 'codeyang',
    to: 'claude-code',
    title,
    description,
    priority: options?.priority,
    files: options?.files,
    parentId: options?.parentId,
    tags: options?.tags,
  });

  if (options?.waitForResult) {
    return waitForTask(task.id, options.waitTimeout || 300_000);
  }

  return task;
}

/**
 * Wait for a task to complete (polling).
 */
export async function waitForTask(taskId: string, timeoutMs = 300_000): Promise<BridgeTask> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    const task = await apiFetch<BridgeTask>('GET', `/api/tasks/${taskId}`);
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Task ${taskId} timed out after ${timeoutMs}ms`);
}

/**
 * Send a text message to Claude Code.
 */
export async function sendMessageToClaude(
  content: string,
  options?: { type?: string; inReplyTo?: string; taskId?: string; filePath?: string },
): Promise<BridgeMessage> {
  return apiFetch<BridgeMessage>('POST', '/api/messages', {
    from: 'codeyang',
    to: 'claude-code',
    type: options?.type || 'text',
    content,
    inReplyTo: options?.inReplyTo,
    taskId: options?.taskId,
    filePath: options?.filePath,
  });
}

/**
 * Read messages from Claude Code.
 */
export async function getMessagesFromClaude(since?: string): Promise<BridgeMessage[]> {
  const query = since ? `?agent=codeyang&since=${since}` : '?agent=codeyang';
  return apiFetch<BridgeMessage[]>('GET', `/api/messages${query}`);
}

/**
 * List pending tasks for Claude Code.
 */
export async function getPendingClaudeTasks(): Promise<BridgeTask[]> {
  return apiFetch<BridgeTask[]>('GET', '/api/tasks?agent=claude-code&status=pending');
}

/**
 * Write a shared file that both agents can access.
 */
export async function writeSharedFile(
  fileName: string,
  content: string,
  notifyAgent?: AgentId,
): Promise<{ name: string; size: number }> {
  return apiFetch<{ name: string; size: number }>('POST', '/api/shared', {
    name: fileName,
    content,
    from: 'codeyang',
    to: notifyAgent || 'claude-code',
  });
}

/**
 * Read a shared file.
 */
export async function readSharedFile(fileName: string): Promise<{ name: string; content: string } | null> {
  try {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return await apiFetch('GET', `/api/shared/${safeName}`);
  } catch {
    return null;
  }
}

/**
 * Get auth token from the bridge config file (for Claude Code to use).
 */
export async function getBridgeToken(): Promise<string> {
  const config = await loadConfig();
  return config.token;
}
