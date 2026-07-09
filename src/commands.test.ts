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

    it('should suggest similar commands for typos', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await dispatch('/clea', ctx);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Did you mean'));
      consoleSpy.mockRestore();
    });

    it('should show available commands when no match', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await dispatch('/xyz123', ctx);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Available:'));
      consoleSpy.mockRestore();
    });
  });

  describe('/exit and /quit', () => {
    it('should handle /exit', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await dispatch('/exit', ctx);

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it('should handle /quit', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await dispatch('/quit', ctx);

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase commands', async () => {
      const result = await dispatch('/CLEAR', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.reset).toHaveBeenCalled();
    });

    it('should handle mixed case commands', async () => {
      const result = await dispatch('/CleAR', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.reset).toHaveBeenCalled();
    });
  });

  describe('whitespace handling', () => {
    it('should trim leading whitespace', async () => {
      const result = await dispatch('   /clear', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.reset).toHaveBeenCalled();
    });

    it('should trim trailing whitespace', async () => {
      const result = await dispatch('/clear   ', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.reset).toHaveBeenCalled();
    });

    it('should trim both leading and trailing whitespace', async () => {
      const result = await dispatch('   /clear   ', ctx);

      expect(result.handled).toBe(true);
      expect(mockAgent.reset).toHaveBeenCalled();
    });
  });

  describe('/model', () => {
    it('should show current model', async () => {
      const result = await dispatch('/model', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });

    it('should accept model argument', async () => {
      const result = await dispatch('/model gpt-4', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });
  });

  describe('/ponytail', () => {
    it('should show current ponytail level', async () => {
      const result = await dispatch('/ponytail', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });

    it('should accept level argument', async () => {
      const result = await dispatch('/ponytail on', ctx);

      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', async () => {
      const result = await dispatch('', ctx);

      expect(result.handled).toBe(false);
    });

    it('should handle just a slash', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const result = await dispatch('/', ctx);

      // A lone slash is treated as unknown command
      expect(result.handled).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should handle multiple slashes', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const result = await dispatch('//clear', ctx);

      // Multiple slashes treated as unknown command
      expect(result.handled).toBe(true);
      consoleSpy.mockRestore();
    });
  });
});
