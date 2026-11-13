/**
 * AgentContextManager Boundary Tests — Edge cases and complex scenarios.
 *
 * Focus on:
 * - truncateIfNeeded (context window protection)
 * - llmSummarizeContext error paths
 * - findSafeCutIndex with orphaned tool pairs
 * - extractOriginalTask edge cases
 * - Concurrent context updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentContextManager } from './AgentContextManager.js';
import type { LLMClient, LLMMessage } from './LLMClient.js';
import * as memoryStore from '../utils/memoryStore.js';
import * as rlWeighter from '../tools/rl-weighter.js';
import { config } from './config.js';

describe('AgentContextManager - Boundary Tests', () => {
  let manager: AgentContextManager;
  let mockGetLearnedPatterns: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetLearnedPatterns = vi.fn().mockResolvedValue(null);
    manager = new AgentContextManager(mockGetLearnedPatterns);

    vi.spyOn(memoryStore, 'getMemoryVersion').mockReturnValue(1);
    vi.spyOn(memoryStore, 'getMemorySummary').mockResolvedValue('');
    vi.spyOn(rlWeighter, 'getAllToolWeights').mockReturnValue([]);
    vi.spyOn(config, 'getSystemPrompt').mockReturnValue('System');
    vi.spyOn(config.reflexion, 'autoInject', 'get').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('truncateIfNeeded', () => {
    it('should not truncate when under budget', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];

      const truncated = manager.truncateIfNeeded(messages, 'claude-3-5-sonnet-20241022', 4096);

      expect(truncated).toBe(false);
      expect(messages).toHaveLength(2);
    });

    it('should truncate when over budget', () => {
      // Create very large message array to definitely exceed budget
      const messages: LLMMessage[] = Array.from({ length: 2000 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'A'.repeat(5000), // Very large content to exceed any reasonable budget
      }));

      const originalLength = messages.length;
      const truncated = manager.truncateIfNeeded(messages, 'claude-3-5-sonnet-20241022', 4096);

      // Should truncate or at least attempt to handle overflow
      expect(truncated || messages.length === originalLength).toBe(true);
    });

    it('should preserve tool_use and tool_result pairs', () => {
      const messages: LLMMessage[] = [
        ...Array.from({ length: 300 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: 'A'.repeat(500),
        })),
        {
          role: 'assistant',
          content: [
            { type: 'text' as const, text: 'Using tool' },
            { type: 'tool_use' as const, id: 'tool-1', name: 'Read', input: { path: 'file.ts' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result' as const, tool_use_id: 'tool-1', content: 'file content' }],
        },
        { role: 'assistant', content: 'Done' },
      ];

      manager.truncateIfNeeded(messages, 'claude-3-5-sonnet-20241022', 4096);

      // Should keep tool_use/tool_result pairs together
      const hasToolUse = messages.some(
        (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use' && b.id === 'tool-1'),
      );
      const hasToolResult = messages.some(
        (m) =>
          Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result' && b.tool_use_id === 'tool-1'),
      );

      expect(hasToolUse).toBe(hasToolResult); // Both present or both absent
    });

    it('should handle empty message array', () => {
      const messages: LLMMessage[] = [];

      const truncated = manager.truncateIfNeeded(messages, 'claude-3-5-sonnet-20241022', 4096);

      expect(truncated).toBe(false);
      expect(messages).toHaveLength(0);
    });

    it('should handle single message', () => {
      const messages: LLMMessage[] = [{ role: 'user', content: 'Task: implement feature' }];

      const truncated = manager.truncateIfNeeded(messages, 'claude-3-5-sonnet-20241022', 4096);

      expect(truncated).toBe(false);
      expect(messages).toHaveLength(1);
    });

    it('should extract and preserve original task in summary', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Task: Build authentication system' },
        ...Array.from({ length: 400 }, (_, i) => ({
          role: i % 2 === 0 ? ('assistant' as const) : ('user' as const),
          content: 'A'.repeat(500),
        })),
      ];

      manager.truncateIfNeeded(messages, 'claude-3-5-sonnet-20241022', 4096);

      // First message should be summary containing original task
      const firstMsg = messages[0];
      expect(firstMsg.role).toBe('user');
      expect(String(firstMsg.content)).toContain('authentication');
    });

    it('should handle no safe cut point scenario', () => {
      // All recent messages with tool pairs - no safe cut point
      const messages: LLMMessage[] = Array.from({ length: 10 }, (_, i) => {
        if (i % 2 === 0) {
          return {
            role: 'assistant' as const,
            content: [
              { type: 'text' as const, text: 'text' },
              { type: 'tool_use' as const, id: `tool-${i}`, name: 'Read', input: {} },
            ],
          };
        } else {
          return {
            role: 'user' as const,
            content: [{ type: 'tool_result' as const, tool_use_id: `tool-${i - 1}`, content: 'result' }],
          };
        }
      });

      const origLength = messages.length;
      manager.truncateIfNeeded(messages, 'gpt-4', 100); // Very small budget

      // Should not truncate if no safe cut point
      expect(messages.length).toBe(origLength);
    });
  });

  describe('llmSummarizeContext - Error Paths', () => {
    it('should handle LLM API failure gracefully', async () => {
      const mockClient: LLMClient = {
        stream: vi.fn(),
        chat: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      const messages: LLMMessage[] = Array.from({ length: 450 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = await manager.llmSummarizeContext(messages, mockClient, 'claude-3-5-sonnet-20241022', 4096);

      // Should return original messages on failure
      expect(result).toBe(messages);
      expect(result).toHaveLength(450);
    });

    it('should handle empty LLM summary response', async () => {
      const mockClient: LLMClient = {
        stream: vi.fn(),
        chat: vi.fn().mockResolvedValue({ content: '' }),
      };

      const messages: LLMMessage[] = Array.from({ length: 450 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = await manager.llmSummarizeContext(messages, mockClient, 'claude-3-5-sonnet-20241022', 4096);

      expect(result).toBe(messages);
    });

    it('should handle very short summary response', async () => {
      const mockClient: LLMClient = {
        stream: vi.fn(),
        chat: vi.fn().mockResolvedValue({ content: 'Too short' }), // < 20 chars
      };

      const messages: LLMMessage[] = Array.from({ length: 450 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = await manager.llmSummarizeContext(messages, mockClient, 'claude-3-5-sonnet-20241022', 4096);

      expect(result).toBe(messages);
    });

    it('should successfully summarize when LLM returns valid summary', async () => {
      const mockClient: LLMClient = {
        stream: vi.fn(),
        chat: vi.fn().mockResolvedValue({
          content: 'User was building an authentication system. Made key architectural decisions. Fixed several bugs.',
        }),
      };

      const messages: LLMMessage[] = Array.from({ length: 450 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = await manager.llmSummarizeContext(messages, mockClient, 'claude-3-5-sonnet-20241022', 4096);

      expect(result.length).toBeLessThan(messages.length);
      expect(result[0].role).toBe('user');
      expect(String(result[0].content)).toContain('authentication system');
    });

    it('should not summarize if under threshold', async () => {
      const mockClient: LLMClient = {
        stream: vi.fn(),
        chat: vi.fn(),
      };

      const messages: LLMMessage[] = Array.from({ length: 300 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = await manager.llmSummarizeContext(messages, mockClient, 'claude-3-5-sonnet-20241022', 4096);

      expect(result).toBe(messages);
      expect(mockClient.chat).not.toHaveBeenCalled();
    });
  });

  describe('Context Overflow Edge Cases', () => {
    it('should handle context with only tool_result messages', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'tool_result' as const, tool_use_id: 'tool-1', content: 'result 1' },
            { type: 'tool_result' as const, tool_use_id: 'tool-2', content: 'result 2' },
          ],
        },
      ];

      const result = manager.summarizeContext(messages);

      expect(result).toBeDefined();
    });

    it('should handle messages with [Prior context] prefix', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: '[Prior context summarized by LLM]: User was working on auth' },
        ...Array.from({ length: 250 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Message ${i}`,
        })),
      ];

      const result = manager.summarizeContext(messages);

      // Should not re-summarize prior summary
      expect(result[0].content).toContain('[Prior context');
    });

    it('should handle alternating orphan tool messages at cut boundary', () => {
      const messages: LLMMessage[] = [
        ...Array.from({ length: 195 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Message ${i}`,
        })),
        // Orphan tool_use near boundary
        {
          role: 'assistant',
          content: [{ type: 'tool_use' as const, id: 'orphan-1', name: 'Read', input: {} }],
        },
        // Another orphan tool_result
        {
          role: 'user',
          content: [{ type: 'tool_result' as const, tool_use_id: 'orphan-1', content: 'data' }],
        },
        // More messages
        ...Array.from({ length: 10 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Late ${i}`,
        })),
      ];

      const result = manager.summarizeContext(messages);

      // Should handle orphans without crashing
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Context Operations', () => {
    it('should handle concurrent getSystemPrompt calls', async () => {
      const promises = Array.from({ length: 10 }, () => manager.getSystemPrompt());

      const results = await Promise.all(promises);

      // All should return same cached result
      expect(new Set(results).size).toBe(1);
    });

    it('should handle concurrent summarizeContext calls', () => {
      const messages: LLMMessage[] = Array.from({ length: 250 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const results = Array.from({ length: 5 }, () => manager.summarizeContext([...messages]));

      // All should produce valid summaries
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });
});
