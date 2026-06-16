/**
 * Claude Code 桥接工具
 *
 * 允许 CodeYang 将任务委托给 Claude Code (VS Code 扩展版本) 执行。
 *
 * 使用方式:
 *   1. 启动桥接服务器:  npx tsx src/bridge/server.ts
 *   2. 在 Claude Code 中运行桥接客户端
 *   3. CodeYang 通过此工具与 Claude Code 通信
 *
 * 环境变量:
 *   BRIDGE_URL   — 桥接服务器地址 (默认: http://127.0.0.1:9876)
 *   BRIDGE_TOKEN — 认证令牌 (从桥接服务器获取)
 */
import { toolError } from './errors.js';
import {
  configureBridge,
  checkBridgeHealth,
  sendTaskToClaude,
  sendMessageToClaude,
  getMessagesFromClaude,
  writeSharedFile,
  readSharedFile,
} from '../bridge/client.js';

let bridgeInitialized = false;

async function ensureBridge(): Promise<void> {
  if (bridgeInitialized) return;

  const url = process.env['BRIDGE_URL'] || 'http://127.0.0.1:9876';
  const token = process.env['BRIDGE_TOKEN'];

  if (!token) {
    throw new Error(
      toolError(
        'ClaudeCode',
        'Bridge token not configured.',
        'Set BRIDGE_TOKEN environment variable, or run the bridge server first:\n' +
          '  npx tsx src/bridge/server.ts\n' +
          '  Then copy the token and set BRIDGE_TOKEN=<token>',
      ),
    );
  }

  await configureBridge(url, token);
  bridgeInitialized = true;
}

/**
 * 检查桥接状态并返回 Claude Code 是否在线
 */
async function executeCheckStatus(): Promise<string> {
  await ensureBridge();
  const health = await checkBridgeHealth();

  if (!health) {
    return '⚠️ Bridge server is not running. Start it with: npx tsx src/bridge/server.ts';
  }

  const lines: string[] = ['## Bridge Status'];
  lines.push(`Server: ${process.env['BRIDGE_URL'] || 'http://127.0.0.1:9876'}`);
  lines.push(`Tasks: ${health.taskCount}`);

  for (const [agent, connected] of Object.entries(health.agents)) {
    lines.push(`  ${agent}: ${connected ? '🟢 Online' : '🔴 Offline'}`);
  }

  if (!health.agents['claude-code']) {
    lines.push('');
    lines.push('⚠️ Claude Code is not connected.');
    lines.push("To connect, run in Claude Code's terminal:");
    lines.push('  npx tsx src/bridge/claude-agent.ts');
  }

  return lines.join('\n');
}

/**
 * 将任务发送给 Claude Code 执行
 */
async function executeDelegateTask(args: {
  title: string;
  description: string;
  priority?: string;
  files?: string[];
  wait?: boolean;
  timeout?: number;
}): Promise<string> {
  await ensureBridge();

  const task = await sendTaskToClaude(args.title, args.description, {
    priority: args.priority,
    files: args.files,
    waitForResult: args.wait !== false,
    waitTimeout: (args.timeout || 5) * 60_000,
  });

  const lines: string[] = [];
  lines.push(`## Task Delegated to Claude Code`);
  lines.push(`ID: ${task.id}`);
  lines.push(`Title: ${task.title}`);
  lines.push(`Status: ${task.status}`);
  lines.push('');

  if (task.status === 'completed') {
    lines.push('### Result');
    lines.push(task.result || '(No result output)');
  } else if (task.status === 'failed') {
    lines.push('### Error');
    lines.push(task.error || 'Unknown error');
  } else if (task.status === 'pending' || task.status === 'running') {
    lines.push('⏳ Task is being processed by Claude Code...');
    lines.push(`Check status later with: claude_check_status()`);
  }

  return lines.join('\n');
}

/**
 * 向 Claude Code 发送消息
 */
async function executeSendMessage(args: {
  content: string;
  type?: 'text' | 'question' | 'status';
  taskId?: string;
}): Promise<string> {
  await ensureBridge();

  await sendMessageToClaude(args.content, {
    type: args.type || 'text',
    taskId: args.taskId,
  });

  return `Message sent to Claude Code.\n\n> ${args.content.slice(0, 200)}${args.content.length > 200 ? '...' : ''}`;
}

/**
 * 获取来自 Claude Code 的消息
 */
async function executeGetMessages(): Promise<string> {
  await ensureBridge();

  const messages = await getMessagesFromClaude();

  if (messages.length === 0) {
    return 'No messages from Claude Code.';
  }

  const lines: string[] = ['## Messages from Claude Code', ''];
  for (const msg of messages.slice(-10)) {
    const time = new Date(msg.timestamp).toLocaleTimeString();
    const type = msg.type === 'task_result' ? '📋' : msg.type === 'question' ? '❓' : '💬';
    lines.push(`${type} [${time}] ${msg.content.slice(0, 300)}`);
    if (msg.content.length > 300) lines.push('   ...(truncated)');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 写共享文件（CodeYang 写，Claude Code 可读）
 */
async function executeWriteShared(args: { fileName: string; content: string }): Promise<string> {
  await ensureBridge();

  const result = await writeSharedFile(args.fileName, args.content);

  return `Shared file written: ${result.name} (${result.size} bytes)\nClaude Code has been notified.`;
}

/**
 * 读共享文件（Claude Code 写的文件）
 */
async function executeReadShared(args: { fileName: string }): Promise<string> {
  await ensureBridge();

  const file = await readSharedFile(args.fileName);

  if (!file) {
    return `Shared file not found: ${args.fileName}`;
  }

  return `## Shared File: ${file.name}\n\n${file.content}`;
}

// ── Tool definitions ──────────────────────────────────────────────

export const claudeCodeTool = {
  name: 'claude_code',
  description: `[Bridge] Interact with Claude Code (VS Code extension AI agent).

Use this when:
- You need a second AI agent to work on a different part of the project
- Claude Code has VS Code-specific capabilities (e.g., debugging in VS Code)
- You want to parallelize work across two AI agents

Actions (use "action" parameter):
- "check_status" — Check if bridge server and Claude Code are connected
- "delegate" — Send a task to Claude Code for execution
- "send_message" — Send a text message to Claude Code
- "get_messages" — Get recent messages from Claude Code
- "write_shared" — Write a file to the shared directory
- "read_shared" — Read a file from the shared directory

For "delegate" action:
- title: Short task title
- description: Detailed task description (what to do, files to modify)
- priority: "low" | "medium" | "high" | "critical"
- files: Array of file paths relevant to the task
- wait: Whether to wait for completion (default: true)
- timeout: Max wait time in minutes (default: 5)`,
  parameters: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform: check_status, delegate, send_message, get_messages, write_shared, read_shared',
        enum: ['check_status', 'delegate', 'send_message', 'get_messages', 'write_shared', 'read_shared'],
      },
      title: {
        type: 'string',
        description: 'Task title (for delegate action)',
      },
      description: {
        type: 'string',
        description: 'Task description (for delegate action)',
      },
      content: {
        type: 'string',
        description: 'Message content (for send_message action)',
      },
      fileName: {
        type: 'string',
        description: 'File name (for write_shared / read_shared actions)',
      },
      priority: {
        type: 'string',
        description: 'Task priority: low, medium, high, critical',
        enum: ['low', 'medium', 'high', 'critical'],
      },
      files: {
        type: 'array',
        description: 'Relevant file paths for the task',
        items: { type: 'string' },
      },
      wait: {
        type: 'boolean',
        description: 'Wait for task completion (default: true)',
      },
      timeout: {
        type: 'number',
        description: 'Max wait time in minutes (default: 5)',
      },
    },
    required: ['action'],
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const action = String(args['action'] || '');

    try {
      switch (action) {
        case 'check_status':
          return await executeCheckStatus();
        case 'delegate':
          return await executeDelegateTask({
            title: String(args['title'] || 'Untitled task'),
            description: String(args['description'] || ''),
            priority: args['priority'] as string,
            files: args['files'] as string[],
            wait: args['wait'] !== false,
            timeout: Number(args['timeout'] || 5),
          });
        case 'send_message':
          return await executeSendMessage({
            content: String(args['content'] || ''),
            type: args['type'] as 'text' | 'question' | 'status',
            taskId: args['taskId'] as string,
          });
        case 'get_messages':
          return await executeGetMessages();
        case 'write_shared':
          return await executeWriteShared({
            fileName: String(args['fileName'] || 'shared.md'),
            content: String(args['content'] || ''),
          });
        case 'read_shared':
          return await executeReadShared({
            fileName: String(args['fileName'] || ''),
          });
        default:
          return `Unknown action: "${action}". Available: check_status, delegate, send_message, get_messages, write_shared, read_shared`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `ClaudeCode bridge error: ${msg}`;
    }
  },
};
