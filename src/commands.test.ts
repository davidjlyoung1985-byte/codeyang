/**
 * Tests for slash command handlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatch } from './commands.js';
import type { CommandContext } from './commands.js';
import type { CliUI } from './ui/CliUI.js';
import type { Agent } from './agent/Agent.js';
import type { McpManager } from './mcp/McpManager.js';

describe('Commands', () => {
  let mockUI: CliUI;
  let mockAgent: Agent;
  let mockMcpMgr: McpManager;
  let ctx: CommandContext;

  beforeEach(() => {
    mockUI = {
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      divider: vi.fn(),
      close: vi.fn(),
      showSystemMessage: vi.fn(),
      promptUser: vi.fn(),
    } as unknown as CliUI;

    mockAgent = {
      exportMessages: vi.fn(() => []),
      reset: vi.fn(),
      getCheckpoints: vi.fn(() => []),
      restoreCheckpoint: vi.fn(() => true),
      saveCheckpoint: vi.fn(() => 0),
      getStats: vi.fn(() => ({ toolStats: new Map() })),
      getToolStats: vi.fn(() => ({})),
      getActiveTaskList: vi.fn(() => []),
    } as unknown as Agent;

    mockMcpMgr = {
      shutdown: vi.fn(),
      getServerStatus: vi.fn(() => ({})),
      listAllTools: vi.fn(() => []),
    } as unknown as McpManager;

    ctx = {
      ui: mockUI,
      agent: mockAgent,
      mcpMgr: mockMcpMgr,
      currentSessionId: 'test-session',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('/clear', () => {
    it('should clear agent history', async () => {
      const result = await dispatch('/clear', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.reset).toHaveBeenCalled();
    });
  });

  describe('/tasks', () => {
    it('should show task list', async () => {
      const result = await dispatch('/tasks', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });
  });

  describe('/rewind', () => {
    it('should rewind to checkpoint when available', async () => {
      mockAgent.restoreCheckpoint = vi.fn(() => true);

      const result = await dispatch('/rewind', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.restoreCheckpoint).toHaveBeenCalled();
    });

    it('should handle no checkpoints', async () => {
      mockAgent.restoreCheckpoint = vi.fn(() => false);

      const result = await dispatch('/rewind', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.restoreCheckpoint).toHaveBeenCalled();
    });
  });

  describe('/stats', () => {
    it('should show tool statistics', async () => {
      const toolStats = new Map([
        ['ReadTool', { calls: 10, totalMs: 1000, errors: 0 }],
        ['WriteTool', { calls: 5, totalMs: 500, errors: 1 }],
      ]);

      mockAgent.getStats = vi.fn(() => ({ toolStats }));

      const result = await dispatch('/stats', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });
  });

  describe('/mcp', () => {
    it('should show MCP server status', async () => {
      mockMcpMgr.getServerStatus = vi.fn(() => ({
        'test-server': { connected: true, toolCount: 5 },
      }));

      const result = await dispatch('/mcp', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });
  });

  describe('/tools', () => {
    it('should list all tools', async () => {
      mockMcpMgr.listAllTools = vi.fn(() => [
        { name: 'read', description: 'Read file' },
        { name: 'write', description: 'Write file' },
      ]);

      const result = await dispatch('/tools', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });
  });

  describe('unhandled commands', () => {
    it('should handle unknown slash commands', async () => {
      const result = await dispatch('/unknown', ctx);

      // Should show suggestions and prompt user
      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });

    it('should return handled=false for regular text', async () => {
      const result = await dispatch('just some text', ctx);

      expect(result.handled).toBe(false);
    });
  });
});
