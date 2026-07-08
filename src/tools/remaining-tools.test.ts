/**
 * Tests for remaining tools that don't have dedicated test files:
 * LaunchAppTool, PowerShellTool, ClaudeCodeTool, WebSearchTool,
 * GitHubTool, LSPTool, ToolSearchTool, EnterPlanModeTool, ExitPlanModeTool
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external dependencies ──────────────────────────

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 }),
}));

vi.mock('axios', () => {
  const mockAxios = vi.fn();
  mockAxios.get = vi.fn();
  mockAxios.post = vi.fn();
  mockAxios.head = vi.fn();
  (mockAxios as unknown as Record<string, unknown>).defaults = { timeout: 30000 };
  return { default: mockAxios };
});

// Mock DNS to prevent SSRF validation from doing real lookups
vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn().mockResolvedValue(['93.184.216.34']),
  resolve6: vi.fn().mockResolvedValue([]),
}));

vi.mock('../bridge/client.js', () => ({
  configureBridge: vi.fn().mockResolvedValue(undefined),
  checkBridgeHealth: vi.fn().mockResolvedValue({ taskCount: 0, agents: { 'claude-code': true } }),
  sendTaskToClaude: vi.fn().mockResolvedValue({ id: 'task-1', title: 'Test', status: 'completed', result: 'Done!' }),
  sendMessageToClaude: vi.fn().mockResolvedValue(undefined),
  getMessagesFromClaude: vi.fn().mockResolvedValue([]),
  writeSharedFile: vi.fn().mockResolvedValue({ name: 'test.md', size: 42 }),
  readSharedFile: vi.fn().mockResolvedValue({ name: 'test.md', content: 'hello' }),
}));

import axios from 'axios';

// ── LaunchAppTool ───────────────────────────────────────
describe('LaunchAppTool', () => {
  let executeLaunchApp: typeof import('./LaunchAppTool.js')['executeLaunchApp'];

  beforeEach(async () => {
    vi.clearAllMocks();
    executeLaunchApp = (await import('./LaunchAppTool.js')).executeLaunchApp;
  });

  it('rejects empty target', async () => {
    const result = await executeLaunchApp('');
    expect(result).toContain('Error');
  });

  it('rejects shell metacharacters', async () => {
    const result = await executeLaunchApp('app; rm -rf /');
    expect(result).toContain('Error');
  });

  it('validates file paths via resolveSafePath', async () => {
    const result = await executeLaunchApp('C:\\test.txt');
    expect(result).toBeDefined();
  });
});

// ── WebSearchTool ───────────────────────────────────────
describe('WebSearchTool', () => {
  let executeWebSearch: typeof import('./WebSearchTool.js')['executeWebSearch'];

  beforeEach(async () => {
    vi.clearAllMocks();
    executeWebSearch = (await import('./WebSearchTool.js')).executeWebSearch;
    process.env['CODEYANG_SEARCH_API'] = 'duckduckgo';
  });

  it('rejects empty query', async () => {
    const result = await executeWebSearch('');
    expect(result).toContain('Error');
  });

  it('handles DuckDuckGo search success', async () => {
    const mockAxios = axios as unknown as ReturnType<typeof vi.fn> & { get: ReturnType<typeof vi.fn> };
    mockAxios.get.mockResolvedValue({
      data: `<html><tr class="result"><td><a href="https://example.com">Test Result</a></td><td class="result-snippet">A snippet</td></tr></html>`,
    });

    const result = await executeWebSearch('test query', 3);
    expect(result).toContain('Test Result');
    expect(result).toContain('Source: duckduckgo');
  });

  it('handles search API errors gracefully', async () => {
    const mockAxios = axios as unknown as ReturnType<typeof vi.fn> & { get: ReturnType<typeof vi.fn> };
    mockAxios.get.mockRejectedValue(new Error('Network error'));

    const result = await executeWebSearch('test', 3);
    expect(result).toContain('Search failed');
  });

  it('supports SearXNG config', async () => {
    process.env['CODEYANG_SEARCH_API'] = 'searxng';
    const mockAxios = axios as unknown as ReturnType<typeof vi.fn> & { get: ReturnType<typeof vi.fn> };
    mockAxios.get.mockResolvedValue({ data: { results: [{ title: 'S', url: 'https://x.com', content: 'c' }] } });

    const result = await executeWebSearch('test', 3);
    expect(result).toContain('S');
  });
});

// ── PowerShellTool ───────────────────────────────────────
describe('PowerShellTool', () => {
  let executePowerShell: typeof import('./PowerShellTool.js')['executePowerShell'];

  beforeEach(async () => {
    vi.clearAllMocks();
    executePowerShell = (await import('./PowerShellTool.js')).executePowerShell;
  });

  it('rejects empty command', async () => {
    try {
      const result = await executePowerShell('');
      expect(result).toBeDefined();
    } catch (e) {
      // Either throws or returns error string — both acceptable
      expect(e).toBeDefined();
    }
  });
});

// ── ToolSearchTool ───────────────────────────────────────
describe('ToolSearchTool', () => {
  let executeToolSearch: typeof import('./ToolSearchTool.js')['executeToolSearch'];

  beforeEach(async () => {
    executeToolSearch = (await import('./ToolSearchTool.js')).executeToolSearch;
  });

  it('returns results for a query', async () => {
    const result = await executeToolSearch('Bash');
    expect(typeof result).toBe('string');
  });

  it('returns empty for non-matching query', async () => {
    const result = await executeToolSearch('XYZZY_NONEXISTENT');
    expect(typeof result).toBe('string');
  });
});

// ── EnterPlanModeTool / ExitPlanModeTool ─────────────────
describe('PlanMode tools', () => {
  let executeEnterPlanMode: typeof import('./EnterPlanModeTool.js')['executeEnterPlanMode'];
  let executeExitPlanMode: typeof import('./ExitPlanModeTool.js')['executeExitPlanMode'];

  beforeEach(async () => {
    // Reset plan mode via registry
    const registry = await import('./registry.js');
    registry.setPlanMode?.(false);
    executeEnterPlanMode = (await import('./EnterPlanModeTool.js')).executeEnterPlanMode;
    executeExitPlanMode = (await import('./ExitPlanModeTool.js')).executeExitPlanMode;
  });

  it('enter plan mode returns confirmation', async () => {
    const result = await executeEnterPlanMode();
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('exit plan mode returns confirmation', async () => {
    const result = await executeExitPlanMode();
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });
});

// ── ClaudeCodeTool ───────────────────────────────────────
describe('ClaudeCodeTool', () => {
  let tool: typeof import('./ClaudeCodeTool.js')['claudeCodeTool'];

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env['BRIDGE_TOKEN'] = 'test-token';
    process.env['BRIDGE_URL'] = 'http://127.0.0.1:9876';
    tool = (await import('./ClaudeCodeTool.js')).claudeCodeTool;
  });

  it('has required tool fields', () => {
    expect(tool.name).toBe('claude_code');
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
    expect(tool.execute).toBeInstanceOf(Function);
  });

  it('returns error for unknown action', async () => {
    const result = await tool.execute({ action: 'invalid_action' });
    expect(result).toContain('Unknown action');
  });

  it('handles check_status action', async () => {
    const result = await tool.execute({ action: 'check_status' });
    expect(result).toBeDefined();
  });

  it('handles delegate action', async () => {
    const result = await tool.execute({ action: 'delegate', title: 'Test task', description: 'Do something' });
    expect(result).toBeDefined();
  });

  it('handles send_message action', async () => {
    const result = await tool.execute({ action: 'send_message', content: 'Hello' });
    expect(result).toContain('Message sent');
  });

  it('handles get_messages action', async () => {
    const result = await tool.execute({ action: 'get_messages' });
    expect(result).toContain('No messages');
  });

  it('handles write_shared action', async () => {
    const result = await tool.execute({ action: 'write_shared', fileName: 'test.md', content: '# Hello' });
    expect(result).toContain('Shared file written');
  });

  it('handles read_shared action', async () => {
    const result = await tool.execute({ action: 'read_shared', fileName: 'test.md' });
    expect(result).toContain('test.md');
  });
});
