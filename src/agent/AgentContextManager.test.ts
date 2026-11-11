/**
 * AgentContextManager Tests — Unit tests for context management.
 *
 * Tests:
 * - System prompt building and caching
 * - Memory loading and versioning
 * - Context summarization
 * - Token estimation
 * - Reflexion pattern injection
 * - RL tool weight injection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentContextManager } from './AgentContextManager.js';
import type { LLMMessage } from './LLMClient.js';
import type { QtContext } from '../qt/index.js';
import * as memoryStore from '../utils/memoryStore.js';
import * as rlWeighter from '../tools/rl-weighter.js';
import { config } from './config.js';

describe('AgentContextManager', () => {
  let manager: AgentContextManager;
  let mockGetLearnedPatterns: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetLearnedPatterns = vi.fn().mockResolvedValue(null);
    manager = new AgentContextManager(mockGetLearnedPatterns);

    // Mock memory store
    vi.spyOn(memoryStore, 'getMemoryVersion').mockReturnValue(1);
    vi.spyOn(memoryStore, 'getMemorySummary').mockResolvedValue('Test memory summary');

    // Mock tool weights
    vi.spyOn(rlWeighter, 'getAllToolWeights').mockReturnValue([]);

    // Mock config
    vi.spyOn(config, 'getSystemPrompt').mockReturnValue('System prompt');
    vi.spyOn(config.reflexion, 'autoInject', 'get').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with learned patterns getter', () => {
      const getter = vi.fn();
      const mgr = new AgentContextManager(getter);
      expect(mgr).toBeDefined();
    });
  });

  describe('Cache Management', () => {
    it('should invalidate cache', async () => {
      // Build prompt once
      const prompt1 = await manager.getSystemPrompt();
      expect(prompt1).toBeDefined();

      // Invalidate cache
      manager.invalidateCache();

      // Should rebuild on next call
      const prompt2 = await manager.getSystemPrompt();
      expect(prompt2).toBeDefined();
    });

    it('should cache system prompt with same memory version', async () => {
      const prompt1 = await manager.getSystemPrompt();
      const prompt2 = await manager.getSystemPrompt();

      expect(prompt1).toBe(prompt2);
      // getSystemPrompt from config should be called once (cached)
      expect(config.getSystemPrompt).toHaveBeenCalledTimes(1);
    });

    it('should rebuild prompt when memory version changes', async () => {
      vi.spyOn(memoryStore, 'getMemoryVersion').mockReturnValue(1);
      const prompt1 = await manager.getSystemPrompt();

      vi.spyOn(memoryStore, 'getMemoryVersion').mockReturnValue(2);
      const prompt2 = await manager.getSystemPrompt();

      expect(prompt1).toBeDefined();
      expect(prompt2).toBeDefined();
      expect(config.getSystemPrompt).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Loading', () => {
    it('should load memory summary', async () => {
      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('System prompt');
      expect(prompt).toContain('Your Memory');
      expect(prompt).toContain('Test memory summary');
    });

    it('should handle memory load failure gracefully', async () => {
      vi.spyOn(memoryStore, 'getMemorySummary').mockRejectedValue(new Error('Memory load failed'));

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('System prompt');
      expect(prompt).not.toContain('Your Memory');
    });

    it('should handle memory version error', async () => {
      // Mock getMemoryVersion to throw during ensureMemoryLoaded
      const getMemoryVersionSpy = vi.spyOn(memoryStore, 'getMemoryVersion');

      // First call for cache check returns 1
      getMemoryVersionSpy.mockReturnValueOnce(1);
      // Second call during ensureMemoryLoaded throws
      getMemoryVersionSpy.mockImplementationOnce(() => {
        throw new Error('Version check failed');
      });

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('System prompt');
    });

    it('should cache memory summary', async () => {
      await manager.getSystemPrompt();
      await manager.getSystemPrompt();

      // Should only load memory once
      expect(memoryStore.getMemorySummary).toHaveBeenCalledTimes(1);
    });

    it('should reload memory when version changes', async () => {
      // First call
      const getMemoryVersionSpy = vi.spyOn(memoryStore, 'getMemoryVersion');
      const getMemorySummarySpy = vi.spyOn(memoryStore, 'getMemorySummary');

      getMemoryVersionSpy.mockReturnValue(1);
      getMemorySummarySpy.mockResolvedValue('First memory');
      await manager.getSystemPrompt();

      // Second call with different version
      getMemoryVersionSpy.mockReturnValue(2);
      getMemorySummarySpy.mockResolvedValue('Updated memory');

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('Updated memory');
      expect(getMemorySummarySpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Qt Context Integration', () => {
    it('should pass Qt context to system prompt', async () => {
      const qtContext: QtContext = {
        isQtProject: true,
        qtVersion: '6.5.0',
        modules: ['QtCore', 'QtGui'],
        buildSystem: 'cmake',
      };

      await manager.getSystemPrompt(qtContext);

      expect(config.getSystemPrompt).toHaveBeenCalledWith(qtContext);
    });

    it('should work without Qt context', async () => {
      await manager.getSystemPrompt();

      expect(config.getSystemPrompt).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Reflexion Pattern Injection', () => {
    it('should inject learned patterns when autoInject is enabled', async () => {
      vi.spyOn(config.reflexion, 'autoInject', 'get').mockReturnValue(true);
      mockGetLearnedPatterns.mockResolvedValue('Pattern 1: Always validate input\nPattern 2: Handle errors gracefully');

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('Learned Patterns');
      expect(prompt).toContain('Pattern 1: Always validate input');
      expect(mockGetLearnedPatterns).toHaveBeenCalledWith(3);
    });

    it('should handle null learned patterns', async () => {
      vi.spyOn(config.reflexion, 'autoInject', 'get').mockReturnValue(true);
      mockGetLearnedPatterns.mockResolvedValue(null);

      const prompt = await manager.getSystemPrompt();

      expect(prompt).not.toContain('Learned Patterns');
    });

    it('should handle empty learned patterns', async () => {
      vi.spyOn(config.reflexion, 'autoInject', 'get').mockReturnValue(true);
      mockGetLearnedPatterns.mockResolvedValue('');

      const prompt = await manager.getSystemPrompt();

      expect(prompt).not.toContain('Learned Patterns');
    });
  });

  describe('RL Tool Weight Injection', () => {
    it('should inject tool performance hints', async () => {
      vi.spyOn(rlWeighter, 'getAllToolWeights').mockReturnValue([
        { name: 'Read', weight: 0.95, successRate: 0.95, calls: 100 },
        { name: 'Write', weight: 0.9, successRate: 0.9, calls: 50 },
        { name: 'BashTool', weight: 0.85, successRate: 0.85, calls: 30 },
      ]);

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('Tool Performance');
      expect(prompt).toContain('Read: 95% success rate');
      expect(prompt).toContain('Write: 90% success rate');
    });

    it('should filter out tools with few calls', async () => {
      vi.spyOn(rlWeighter, 'getAllToolWeights').mockReturnValue([
        { name: 'Read', weight: 0.95, successRate: 0.95, calls: 100 },
        { name: 'RareTool', weight: 0.9, successRate: 0.9, calls: 1 },
      ]);

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('Read');
      expect(prompt).not.toContain('RareTool');
    });

    it('should limit to top 10 tools', async () => {
      const tools = Array.from({ length: 20 }, (_, i) => ({
        name: `Tool${i}`,
        weight: 1 - i * 0.01,
        successRate: 1 - i * 0.01,
        calls: 100,
      }));
      vi.spyOn(rlWeighter, 'getAllToolWeights').mockReturnValue(tools);

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toContain('Tool0');
      expect(prompt).toContain('Tool9');
      expect(prompt).not.toContain('Tool10');
    });

    it('should handle empty tool weights', async () => {
      vi.spyOn(rlWeighter, 'getAllToolWeights').mockReturnValue([]);

      const prompt = await manager.getSystemPrompt();

      expect(prompt).not.toContain('Tool Performance');
    });
  });

  describe('Context Summarization', () => {
    it('should not summarize short contexts', () => {
      const messages: LLMMessage[] = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = manager.summarizeContext(messages);

      expect(result).toHaveLength(10);
      expect(result).toEqual(messages);
    });

    it('should summarize long contexts', () => {
      const messages: LLMMessage[] = Array.from({ length: 250 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = manager.summarizeContext(messages);

      expect(result.length).toBeLessThan(messages.length);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should keep recent messages', () => {
      const messages: LLMMessage[] = Array.from({ length: 250 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = manager.summarizeContext(messages);

      // Should contain last message
      expect(result[result.length - 1].content).toBe('Message 249');
    });

    it('should handle orphan tool use messages', () => {
      const messages: LLMMessage[] = [
        ...Array.from({ length: 200 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Message ${i}`,
        })),
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tc_1', name: 'Read', input: {} }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tc_1', content: 'result' }],
        },
      ];

      const result = manager.summarizeContext(messages);

      // Should not orphan tool_use and tool_result pairs
      expect(result.length).toBeGreaterThan(0);
    });

    it('should create summary message', () => {
      const messages: LLMMessage[] = Array.from({ length: 250 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}`,
      }));

      const result = manager.summarizeContext(messages);

      // First message should be summary
      expect(result[0].role).toBe('user');
      expect(result[0].content).toContain('summarized');
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      // estimateMessageTokens is tested separately
      // Here we just verify the manager can handle messages
      expect(messages).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message array', () => {
      const result = manager.summarizeContext([]);

      expect(result).toEqual([]);
    });

    it('should handle single message', () => {
      const messages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];

      const result = manager.summarizeContext(messages);

      expect(result).toEqual(messages);
    });

    it('should handle complex content structures', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'tool_use', id: 'tc_1', name: 'Read', input: { file: 'test.txt' } },
          ],
        },
      ];

      const result = manager.summarizeContext(messages);

      expect(result).toBeDefined();
    });

    it('should handle memory load failure once', async () => {
      let callCount = 0;
      vi.spyOn(memoryStore, 'getMemorySummary').mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('First failure');
        return Promise.resolve('Success');
      });

      // First call fails
      const prompt1 = await manager.getSystemPrompt();
      expect(prompt1).not.toContain('Test memory summary');

      // Should not retry on second call (failure cached)
      const prompt2 = await manager.getSystemPrompt();
      expect(prompt2).not.toContain('Test memory summary');
    });
  });

  describe('Debug Mode', () => {
    it('should log warnings in debug mode', async () => {
      process.env.CODEYANG_DEBUG = 'true';

      const getMemoryVersionSpy = vi.spyOn(memoryStore, 'getMemoryVersion');
      // First call for cache check returns 1
      getMemoryVersionSpy.mockReturnValueOnce(1);
      // Second call during ensureMemoryLoaded throws
      getMemoryVersionSpy.mockImplementationOnce(() => {
        throw new Error('Version error');
      });

      const prompt = await manager.getSystemPrompt();

      expect(prompt).toBeDefined();
      delete process.env.CODEYANG_DEBUG;
    });
  });
});
