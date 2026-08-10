import { describe, it, expect, vi } from 'vitest';
import {
  setupRunInitialization,
  prepareMessages,
  setupToolContext,
  handleContextSummarization,
  handleTreeOfThoughts,
  handlePlanner,
  cleanupRun,
} from './AgentRunMethods.js';
import type { LLMMessage } from './LLMClient.js';

describe('AgentRunMethods', () => {
  describe('setupRunInitialization', () => {
    it('should initialize gateway and tracer', async () => {
      const mockGateway = {
        createRequest: vi.fn().mockReturnValue({ id: '123' }),
        handle: vi.fn().mockResolvedValue({ success: true }),
      };

      const mockTracer = {
        startTrace: vi.fn().mockReturnValue('trace-123'),
      };

      const result = await setupRunInitialization(mockGateway, mockTracer, 'test prompt');

      expect(result.traceId).toBe('trace-123');
      expect(result.abortController).toBeInstanceOf(AbortController);
      expect(mockGateway.createRequest).toHaveBeenCalled();
      expect(mockGateway.handle).toHaveBeenCalled();
      expect(mockTracer.startTrace).toHaveBeenCalled();
    });

    it('should throw when gateway rejects', async () => {
      const mockGateway = {
        createRequest: vi.fn().mockReturnValue({ id: '123' }),
        handle: vi.fn().mockResolvedValue({ success: false, error: 'Rejected' }),
      };

      const mockTracer = {
        startTrace: vi.fn(),
      };

      await expect(
        setupRunInitialization(mockGateway, mockTracer, 'test'),
      ).rejects.toThrow(/Gateway.*Rejected/);
    });
  });

  describe('prepareMessages', () => {
    it('should prepare messages with simple prompt', () => {
      const history: LLMMessage[] = [{ role: 'user', content: 'hello' }];
      const callback = vi.fn();

      const result = prepareMessages(history, 'fix bug', callback);

      expect(result.length).toBe(2);
      expect(result[1]).toEqual({ role: 'user', content: 'fix bug' });
      expect(callback).toHaveBeenCalledWith('fix bug');
    });

    it('should format complex prompts', () => {
      const history: LLMMessage[] = [];
      const longPrompt = 'a'.repeat(201);

      const result = prepareMessages(history, longPrompt);

      expect(result.length).toBe(1);
      expect(result[0].content).toContain('Task:');
      expect(result[0].content).toContain('outline your approach');
    });

    it('should not mutate original history', () => {
      const history: LLMMessage[] = [{ role: 'user', content: 'original' }];
      const originalLength = history.length;

      prepareMessages(history, 'new prompt');

      expect(history.length).toBe(originalLength);
    });
  });

  describe('setupToolContext', () => {
    it('should setup tool context with signal', () => {
      const mockClient = { name: 'test-client' };
      const abortController = new AbortController();

      // This function has side effects, we just verify it doesn't throw
      expect(() => setupToolContext(mockClient, abortController.signal)).not.toThrow();
    });
  });

  describe('handleContextSummarization', () => {
    it('should apply rule-based summarization', async () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'response1' },
      ];

      const summarized: LLMMessage[] = [{ role: 'user', content: 'summary' }];

      const mockCtxManager = {
        summarizeContext: vi.fn().mockReturnValue(summarized),
        llmSummarizeContext: vi.fn(),
      };

      const mockClient = {};

      await handleContextSummarization(messages, mockCtxManager, mockClient);

      expect(messages).toEqual(summarized);
      expect(mockCtxManager.summarizeContext).toHaveBeenCalled();
    });

    it('should apply LLM summarization for large contexts', async () => {
      const messages: LLMMessage[] = new Array(401).fill({ role: 'user', content: 'msg' });

      const llmSummarized: LLMMessage[] = [{ role: 'user', content: 'llm-summary' }];

      const mockCtxManager = {
        summarizeContext: vi.fn().mockReturnValue(messages),
        llmSummarizeContext: vi.fn().mockResolvedValue(llmSummarized),
      };

      const mockClient = {};
      const callback = vi.fn();

      await handleContextSummarization(messages, mockCtxManager, mockClient, callback);

      expect(mockCtxManager.llmSummarizeContext).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        'Context Summarizer',
        expect.any(String),
        false,
      );
    });

    it('should throw if messages become empty', async () => {
      const messages: LLMMessage[] = [];

      const mockCtxManager = {
        summarizeContext: vi.fn().mockReturnValue(messages),
        llmSummarizeContext: vi.fn(),
      };

      await expect(
        handleContextSummarization(messages, mockCtxManager, {}),
      ).rejects.toThrow(/empty/);
    });
  });

  describe('handleTreeOfThoughts', () => {
    it('should skip if not needed', async () => {
      const mockToT = {
        shouldUseToT: vi.fn().mockReturnValue(false),
        explore: vi.fn(),
      };

      const messages: LLMMessage[] = [];

      await handleTreeOfThoughts(mockToT, 'simple task', messages, {});

      expect(mockToT.explore).not.toHaveBeenCalled();
    });

    it('should execute ToT and add results', async () => {
      const mockToT = {
        shouldUseToT: vi.fn().mockReturnValue(true),
        explore: vi.fn().mockResolvedValue({
          selected: {
            approach: 'approach A',
            steps: ['step1', 'step2'],
            evaluation: { score: 85 },
          },
          explored: [{ approach: 'A' }, { approach: 'B' }],
          summary: 'ToT summary',
        }),
      };

      const messages: LLMMessage[] = [];
      const onAgentDelta = vi.fn();
      const onToolResult = vi.fn();

      await handleTreeOfThoughts(
        mockToT,
        'complex task',
        messages,
        {},
        onAgentDelta,
        onToolResult,
      );

      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('ToT summary');
      expect(onAgentDelta).toHaveBeenCalledWith(expect.stringContaining('Tree-of-Thoughts'));
      expect(onToolResult).toHaveBeenCalledWith(
        'Tree-of-Thoughts',
        expect.stringContaining('2 paths explored'),
        false,
      );
    });
  });

  describe('handlePlanner', () => {
    it('should skip if planner disabled', async () => {
      const mockPlanner = {
        shouldPlan: vi.fn().mockReturnValue(false),
        generatePlan: vi.fn(),
      };

      const result = await handlePlanner(mockPlanner, 'task', [], {});

      expect(result).toBeNull();
      expect(mockPlanner.generatePlan).not.toHaveBeenCalled();
    });

    it('should generate and activate plan', async () => {
      const mockPlanner = {
        shouldPlan: vi.fn().mockReturnValue(true),
        generatePlan: vi.fn().mockResolvedValue({
          id: 'plan-123',
          task: 'Build app',
          steps: [
            { description: 'Step 1', dependencies: [] },
            { description: 'Step 2', dependencies: ['Step 1'] },
          ],
        }),
        activatePlan: vi.fn(),
      };

      const messages: LLMMessage[] = [];
      const onToolResult = vi.fn();

      // Temporarily enable planner for test
      const originalEnabled = (await import('./config.js')).config.planner.enabled;
      (await import('./config.js')).config.planner.enabled = true;

      const result = await handlePlanner(
        mockPlanner,
        'complex task',
        messages,
        {},
        undefined,
        onToolResult,
      );

      // Restore
      (await import('./config.js')).config.planner.enabled = originalEnabled;

      expect(result).toBe('plan-123');
      expect(messages.length).toBe(1);
      expect(messages[0].content).toContain('Generated Plan');
      expect(messages[0].content).toContain('Step 1');
      expect(mockPlanner.activatePlan).toHaveBeenCalledWith('plan-123');
      expect(onToolResult).toHaveBeenCalled();
    });
  });

  describe('cleanupRun', () => {
    it('should cleanup context and end trace', () => {
      const mockTracer = {
        endTrace: vi.fn(),
      };

      cleanupRun(mockTracer, 'trace-123');

      expect(mockTracer.endTrace).toHaveBeenCalledWith('trace-123');
    });

    it('should handle empty trace ID', () => {
      const mockTracer = {
        endTrace: vi.fn(),
      };

      expect(() => cleanupRun(mockTracer, '')).not.toThrow();
    });
  });
});
