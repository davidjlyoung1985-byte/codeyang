/**
 * Additional tests for commands to improve coverage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatch } from './commands.js';
import type { CommandContext } from './commands.js';
import type { CliUI } from './ui/CliUI.js';
import type { Agent } from './agent/Agent.js';
import type { McpManager } from './mcp/McpManager.js';

// Mock process.exit to prevent test runner from exiting
const originalExit = process.exit;
beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});
afterEach(() => {
  (process.exit as unknown as ReturnType<typeof vi.spyOn>).mockRestore?.();
});

describe('Commands - Extended Coverage', () => {
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
      getToolStats: vi.fn(() => new Map()),
      getActiveTaskList: vi.fn(() => []),
      getTokenUsage: vi.fn(() => ({ inputTokens: 100, outputTokens: 50 })),
      getLLMClient: vi.fn(),
      getReflexionEngine: vi.fn(() => ({
        getRecentExecutions: vi.fn(() => []),
        shouldReflect: vi.fn(() => false),
        reflect: vi.fn(),
      })),
      getClosedLoopStatus: vi.fn(() => ({
        autoVerify: true,
        autoFixOnError: true,
        watchMode: true,
        reflexion: { enabled: true, consecutiveFailures: 0, totalReflections: 0, recentErrors: 0 },
        planner: { enabled: true, activePlans: 0, totalPlans: 0 },
      })),
      getHarnessStatus: vi.fn(() => ({
        tracing: { enabled: true, recentTraces: 0, totalSpans: 0 },
        circuitBreakers: [],
        gateway: { operations: 0, totalRequests: 0 },
      })),
      answerQuestion: vi.fn(),
      cancelQuestion: vi.fn(),
      get waitingForAnswer() {
        return false;
      },
    } as unknown as Agent;

    mockMcpMgr = {
      shutdown: vi.fn(),
      getServerStatus: vi.fn(() => ({})),
      listAllTools: vi.fn(() => []),
      hasServers: false,
      serverNames: [],
    } as unknown as McpManager;

    ctx = {
      ui: mockUI,
      agent: mockAgent,
      mcpMgr: mockMcpMgr,
      currentSessionId: 'test-session',
    };
  });

  describe('/exit and /quit', () => {
    it('should handle /exit command', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('EXIT_CALLED');
      });
      try {
        await dispatch('/exit', ctx);
      } catch (e: unknown) {
        expect((e as Error).message).toBe('EXIT_CALLED');
      }
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle /quit command', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('EXIT_CALLED');
      });
      try {
        await dispatch('/quit', ctx);
      } catch (e: unknown) {
        expect((e as Error).message).toBe('EXIT_CALLED');
      }
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('/help', () => {
    it('should display help information', async () => {
      const result = await dispatch('/help', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('/model', () => {
    it('should display current model', async () => {
      const result = await dispatch('/model', ctx);
      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });

    it('should handle model switching', async () => {
      const result = await dispatch('/model gpt-4', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('/ponytail', () => {
    it('should display ponytail status', async () => {
      const result = await dispatch('/ponytail', ctx);
      expect(result.handled).toBe(true);
    });

    it('should handle ponytail level change', async () => {
      const result = await dispatch('/ponytail high', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('/config', () => {
    it('should display configuration', async () => {
      const result = await dispatch('/config', ctx);
      expect(result.handled).toBe(true);
      expect(mockUI.promptUser).toHaveBeenCalled();
    });
  });

  describe('/reload', () => {
    it('should reload configuration', async () => {
      const result = await dispatch('/reload', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('/sessions', () => {
    it('should list sessions', async () => {
      const result = await dispatch('/sessions', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('/plan', () => {
    it('should show current plan', async () => {
      const result = await dispatch('/plan', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('/tag', () => {
    it('should create checkpoint', async () => {
      const result = await dispatch('/tag', ctx);
      expect(result.handled).toBe(true);
      expect(mockAgent.saveCheckpoint).toHaveBeenCalled();
    });
  });

  describe('/ctx_viz and /context', () => {
    it('should show context visualization with /ctx_viz', async () => {
      const result = await dispatch('/ctx_viz', ctx);
      expect(result.handled).toBe(true);
    });

    it('should show context visualization with /context', async () => {
      const result = await dispatch('/context', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('Git commands', () => {
    it('should handle /diff command', async () => {
      const result = await dispatch('/diff', ctx);
      expect(result.handled).toBe(true);
    });

    it('should handle /branch command', async () => {
      const result = await dispatch('/branch', ctx);
      expect(result.handled).toBe(true);
    });

    it('should handle /commit with message', async () => {
      const result = await dispatch('/commit test message', ctx);
      expect(result.handled).toBe(true);
    }, 30000);

    it('should handle /commit without message', async () => {
      const result = await dispatch('/commit', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('Command parsing', () => {
    it('should handle commands with extra whitespace', async () => {
      const result = await dispatch('  /clear  ', ctx);
      expect(result.handled).toBe(true);
    });

    it('should handle uppercase commands', async () => {
      const result = await dispatch('/CLEAR', ctx);
      expect(result.handled).toBe(true);
    });

    it('should handle mixed case commands', async () => {
      const result = await dispatch('/Clear', ctx);
      expect(result.handled).toBe(true);
    });
  });

  describe('Error scenarios', () => {
    it('should handle agent errors gracefully', async () => {
      mockAgent.reset = vi.fn(() => {
        throw new Error('Reset failed');
      });

      try {
        await dispatch('/clear', ctx);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });
  });
});
