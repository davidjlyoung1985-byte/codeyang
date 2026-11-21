/**
 * Session and agent management commands tests
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cmdClear, cmdRewind, cmdTag, cmdCtxViz, cmdPlan } from './session.js';
import type { CommandContext } from './types.js';

describe('Session Commands', () => {
  let mockCtx: CommandContext;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCtx = {
      ui: {
        promptUser: vi.fn(),
        showSystemMessage: vi.fn(),
      },
      agent: {
        reset: vi.fn(),
        restoreCheckpoint: vi.fn(),
        saveCheckpoint: vi.fn(),
        getTokenUsage: vi.fn().mockReturnValue({ inputTokens: 1000, outputTokens: 500 }),
        exportMessages: vi.fn().mockReturnValue([{}, {}, {}]),
      } as any,
    };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cmdClear', () => {
    it('should reset agent and show message', () => {
      const result = cmdClear(mockCtx);

      expect(mockCtx.agent.reset).toHaveBeenCalled();
      expect(mockCtx.ui.showSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Conversation cleared'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });
  });

  describe('cmdRewind', () => {
    it('should rewind to previous checkpoint when available', () => {
      (mockCtx.agent.restoreCheckpoint as any).mockReturnValue(true);

      const result = cmdRewind(mockCtx);

      expect(mockCtx.agent.restoreCheckpoint).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Rewound'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should show message when no checkpoints available', () => {
      (mockCtx.agent.restoreCheckpoint as any).mockReturnValue(false);

      const result = cmdRewind(mockCtx);

      expect(mockCtx.agent.restoreCheckpoint).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No checkpoints'));
      expect(result.handled).toBe(true);
    });
  });

  describe('cmdTag', () => {
    it('should save checkpoint and display index', () => {
      (mockCtx.agent.saveCheckpoint as any).mockReturnValue(3);

      const result = cmdTag(mockCtx);

      expect(mockCtx.agent.saveCheckpoint).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Checkpoint 3'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });
  });

  describe('cmdCtxViz', () => {
    it('should display token usage visualization', () => {
      const result = cmdCtxViz(mockCtx);

      expect(mockCtx.agent.getTokenUsage).toHaveBeenCalled();
      expect(mockCtx.agent.exportMessages).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Context:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Used: 1,500'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should calculate percentage correctly', () => {
      (mockCtx.agent.getTokenUsage as any).mockReturnValue({ inputTokens: 50000, outputTokens: 50000 });

      cmdCtxViz(mockCtx);

      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('100,000');
    });
  });

  describe('cmdPlan', () => {
    it('should toggle plan mode on', async () => {
      const mockRegistry = {
        isPlanMode: vi.fn().mockReturnValue(false),
        setPlanMode: vi.fn(),
      };

      vi.doMock('../tools/registry.js', () => mockRegistry);

      const result = await cmdPlan(mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('planning mode'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should toggle plan mode off', async () => {
      const mockRegistry = {
        isPlanMode: vi.fn().mockReturnValue(true),
        setPlanMode: vi.fn(),
      };

      vi.doMock('../tools/registry.js', () => mockRegistry);

      const result = await cmdPlan(mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('deactivated'));
      expect(result.handled).toBe(true);
    });
  });
});
