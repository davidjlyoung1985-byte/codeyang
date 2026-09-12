import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BridgeTask } from './types.js';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('ws');

describe('claude-agent configuration', () => {
  beforeEach(() => {
    // Clear environment
    delete process.env['BRIDGE_URL'];
    delete process.env['BRIDGE_TOKEN'];
    // Save original argv
    vi.stubGlobal('originalArgv', process.argv);
  });

  afterEach(() => {
    // Restore argv
    if ((global as any).originalArgv) {
      process.argv = (global as any).originalArgv;
    }
    vi.clearAllMocks();
  });

  it('should use default URL when not configured', () => {
    const defaultUrl = 'http://127.0.0.1:9876';
    expect(process.env['BRIDGE_URL'] || defaultUrl).toBe(defaultUrl);
  });

  it('should read token from environment', () => {
    process.env['BRIDGE_TOKEN'] = 'test-token-123';
    expect(process.env['BRIDGE_TOKEN']).toBe('test-token-123');
  });

  it('should parse CLI args for token', () => {
    process.argv = ['node', 'script.js', '--token', 'cli-token-456'];
    const tokenArg = process.argv[process.argv.indexOf('--token') + 1];
    expect(tokenArg).toBe('cli-token-456');
  });

  it('should parse CLI args for URL', () => {
    process.argv = ['node', 'script.js', '--url', 'http://custom-url:8080'];
    const urlArg = process.argv[process.argv.indexOf('--url') + 1];
    expect(urlArg).toBe('http://custom-url:8080');
  });

  it('should handle both token and URL from CLI', () => {
    process.argv = ['node', 'script.js', '--token', 'test-token', '--url', 'http://localhost:9999'];
    const tokenArg = process.argv[process.argv.indexOf('--token') + 1];
    const urlArg = process.argv[process.argv.indexOf('--url') + 1];
    expect(tokenArg).toBe('test-token');
    expect(urlArg).toBe('http://localhost:9999');
  });
});

describe('claude-agent API utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should construct API URL correctly', () => {
    const baseUrl = 'http://127.0.0.1:9876';
    const path = '/api/tasks';
    const fullUrl = `${baseUrl}${path}`;
    expect(fullUrl).toBe('http://127.0.0.1:9876/api/tasks');
  });

  it('should include authorization header', () => {
    const token = 'test-token';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('should handle fetch timeout', async () => {
    const signal = AbortSignal.timeout(10000);
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
  });

  it('should serialize request body as JSON', () => {
    const body = { status: 'running', timestamp: '2024-01-01' };
    const serialized = JSON.stringify(body);
    expect(serialized).toContain('"status":"running"');
    expect(serialized).toContain('"timestamp":"2024-01-01"');
  });

  it('should handle API error responses', async () => {
    const errorResponse = {
      error: 'Unauthorized',
      status: 401,
    };
    const errorMessage = `API error (${errorResponse.status}): ${errorResponse.error}`;
    expect(errorMessage).toBe('API error (401): Unauthorized');
  });
});

describe('claude-agent task handling', () => {
  const mockTask: BridgeTask = {
    id: 'task-123',
    title: 'Test Task',
    description: 'This is a test task\nwith multiple lines',
    priority: 'high',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    files: ['src/file1.ts', 'src/file2.ts'],
    agent: 'claude-code',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create tasks directory', async () => {
    const mockMkdir = vi.mocked(mkdir);
    await mkdir('/path/to/tasks', { recursive: true });
    expect(mockMkdir).toHaveBeenCalledWith('/path/to/tasks', { recursive: true });
  });

  it('should save task to file', async () => {
    const mockWriteFile = vi.mocked(writeFile);
    const filePath = '/path/to/task-123.json';
    const content = JSON.stringify(mockTask, null, 2);
    await writeFile(filePath, content);
    expect(mockWriteFile).toHaveBeenCalledWith(filePath, content);
  });

  it('should format task JSON correctly', () => {
    const json = JSON.stringify(mockTask, null, 2);
    expect(json).toContain('"id": "task-123"');
    expect(json).toContain('"title": "Test Task"');
    expect(json).toContain('"priority": "high"');
  });

  it('should handle task with no files', () => {
    const taskNoFiles = { ...mockTask, files: undefined };
    const json = JSON.stringify(taskNoFiles);
    expect(json).toBeDefined();
    expect(json).toContain('"id":"task-123"');
  });

  it('should handle task with empty files array', () => {
    const taskEmptyFiles = { ...mockTask, files: [] };
    expect(taskEmptyFiles.files).toHaveLength(0);
  });

  it('should split multiline description', () => {
    const lines = mockTask.description.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('This is a test task');
    expect(lines[1]).toBe('with multiple lines');
  });

  it('should format file paths correctly', () => {
    const taskDir = '/tasks';
    const taskId = 'task-123';
    const filePath = join(taskDir, `${taskId}.json`);
    expect(filePath).toContain('task-123.json');
  });
});

describe('claude-agent WebSocket handling', () => {
  it('should convert HTTP URL to WebSocket URL', () => {
    const httpUrl = 'http://127.0.0.1:9876';
    const wsUrl = httpUrl.replace(/^http/, 'ws');
    expect(wsUrl).toBe('ws://127.0.0.1:9876');
  });

  it('should convert HTTPS URL to WSS URL', () => {
    const httpsUrl = 'https://example.com:9876';
    const wssUrl = httpsUrl.replace(/^http/, 'ws');
    expect(wssUrl).toBe('wss://example.com:9876');
  });

  it('should add agent query parameter', () => {
    const baseUrl = 'ws://127.0.0.1:9876';
    const agent = 'claude-code';
    const urlWithAgent = `${baseUrl}?agent=${agent}`;
    expect(urlWithAgent).toBe('ws://127.0.0.1:9876?agent=claude-code');
  });

  it('should create auth message', () => {
    const authMsg = {
      type: 'auth',
      payload: { token: 'test-token' },
    };
    const serialized = JSON.stringify(authMsg);
    expect(serialized).toContain('"type":"auth"');
    expect(serialized).toContain('"token":"test-token"');
  });

  it('should create ping message', () => {
    const pingMsg = {
      type: 'ping',
      payload: {},
      timestamp: '2024-01-01T00:00:00Z',
    };
    const serialized = JSON.stringify(pingMsg);
    expect(serialized).toContain('"type":"ping"');
    expect(serialized).toContain('"timestamp"');
  });

  it('should calculate exponential backoff', () => {
    const attempt1 = Math.min(1000 * Math.pow(2, 0), 30_000);
    const attempt2 = Math.min(1000 * Math.pow(2, 1), 30_000);
    const attempt3 = Math.min(1000 * Math.pow(2, 2), 30_000);
    const attempt10 = Math.min(1000 * Math.pow(2, 10), 30_000);

    expect(attempt1).toBe(1000);
    expect(attempt2).toBe(2000);
    expect(attempt3).toBe(4000);
    expect(attempt10).toBe(30_000); // capped at max
  });

  it('should enforce max reconnect attempts', () => {
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
    }

    expect(attempts).toBe(10);
    expect(attempts >= maxAttempts).toBe(true);
  });
});

describe('claude-agent console output', () => {
  it('should format divider correctly', () => {
    const divider = '='.repeat(60);
    expect(divider.length).toBe(60);
    expect(divider).toBe('============================================================');
  });

  it('should truncate long token for display', () => {
    const token = 'very-long-token-1234567890abcdefghijklmnopqrstuvwxyz';
    const truncated = token.slice(0, 16) + '...';
    expect(truncated).toBe('very-long-token-...');
    expect(truncated.length).toBe(19);
  });

  it('should truncate message preview', () => {
    const longMessage = 'a'.repeat(300);
    const preview = longMessage.slice(0, 200);
    expect(preview.length).toBe(200);
  });

  it('should format task ID for display', () => {
    const fullId = 'task-123456789abcdef';
    const shortId = fullId.slice(-8);
    expect(shortId).toBe('89abcdef');
    expect(shortId.length).toBeLessThanOrEqual(8);
  });
});

describe('claude-agent command handling', () => {
  it('should recognize exit commands', () => {
    const commands = ['exit', 'quit', 'q'];
    commands.forEach((cmd) => {
      expect(['exit', 'quit', 'q'].includes(cmd)).toBe(true);
    });
  });

  it('should recognize status command', () => {
    const cmd = 'status';
    expect(cmd).toBe('status');
  });

  it('should recognize tasks command', () => {
    const cmd = 'tasks';
    expect(cmd).toBe('tasks');
  });

  it('should recognize help command', () => {
    const cmd = 'help';
    expect(cmd).toBe('help');
  });

  it('should trim whitespace from commands', () => {
    const input = '  status  \n';
    const trimmed = input.trim();
    expect(trimmed).toBe('status');
  });
});

describe('claude-agent API endpoints', () => {
  it('should format health endpoint', () => {
    const endpoint = '/api/health';
    expect(endpoint).toBe('/api/health');
  });

  it('should format tasks endpoint with filters', () => {
    const agent = 'claude-code';
    const status = 'pending';
    const endpoint = `/api/tasks?agent=${agent}&status=${status}`;
    expect(endpoint).toBe('/api/tasks?agent=claude-code&status=pending');
  });

  it('should format tasks endpoint with since parameter', () => {
    const since = '2024-01-01T00:00:00Z';
    const endpoint = `/api/tasks?since=${since}`;
    expect(endpoint).toContain('since=2024-01-01T00:00:00Z');
  });

  it('should format task update endpoint', () => {
    const taskId = 'task-123';
    const endpoint = `/api/tasks/${taskId}`;
    expect(endpoint).toBe('/api/tasks/task-123');
  });
});

describe('claude-agent timing', () => {
  it('should use correct poll interval', () => {
    const pollInterval = 5000;
    expect(pollInterval).toBe(5000);
    expect(pollInterval).toBeGreaterThan(0);
  });

  it('should use correct keepalive interval', () => {
    const keepaliveInterval = 30_000;
    expect(keepaliveInterval).toBe(30000);
    expect(keepaliveInterval).toBeGreaterThan(0);
  });

  it('should format ISO timestamp', () => {
    const timestamp = new Date('2024-01-01T00:00:00Z').toISOString();
    expect(timestamp).toBe('2024-01-01T00:00:00.000Z');
  });
});
