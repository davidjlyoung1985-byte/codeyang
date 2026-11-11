/**
 * AgentToolExecutor comprehensive tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentToolExecutor } from './AgentToolExecutor.js';
import { ReflexionEngine } from '../experimental/reflexion/ReflexionEngine.js';
import { registerTool } from '../tools/registry.js';
import type { Tool } from '../types.js';

describe('AgentToolExecutor', () => {
  let executor: AgentToolExecutor;
  let reflexionEngine: ReflexionEngine;

  beforeEach(() => {
    reflexionEngine = new ReflexionEngine({
      maxReflections: 10,
      autoLearn: true,
      persistPath: './.codeyang/reflexion',
    });
    executor = new AgentToolExecutor(reflexionEngine);
  });

  describe('Cache Management', () => {
    it('should invalidate all cache when no filePath given', () => {
      // Manually populate cache
      (executor as any).toolCache.set('Read:{"filePath":"test.ts"}', {
        result: 'content',
        timestamp: Date.now(),
      });

      executor.invalidateCache();

      expect((executor as any).toolCache.size).toBe(0);
    });

    it('should invalidate specific file cache', () => {
      (executor as any).toolCache.set('Read:{"filePath":"test.ts"}', {
        result: 'content',
        timestamp: Date.now(),
      });
      (executor as any).toolCache.set('Read:{"filePath":"other.ts"}', {
        result: 'other',
        timestamp: Date.now(),
      });

      executor.invalidateCache('test.ts');

      expect((executor as any).toolCache.has('Read:{"filePath":"test.ts"}')).toBe(false);
      expect((executor as any).toolCache.has('Read:{"filePath":"other.ts"}')).toBe(true);
    });

    it('should handle invalid JSON in cache key', () => {
      (executor as any).toolCache.set('Read:invalid-json-test.ts', {
        result: 'content',
        timestamp: Date.now(),
      });

      // Should not throw, should invalidate by substring match
      executor.invalidateCache('test.ts');

      expect((executor as any).toolCache.has('Read:invalid-json-test.ts')).toBe(false);
    });

    it('should evict old cache entries when size exceeds MAX_CACHE_SIZE', () => {
      // Populate cache beyond limit
      for (let i = 0; i < 250; i++) {
        (executor as any).toolCache.set(`key${i}`, {
          result: `result${i}`,
          timestamp: Date.now() + i,
        });
      }

      (executor as any).evictStaleCacheEntries();

      // Should reduce to CACHE_CLEANUP_THRESHOLD (150)
      expect((executor as any).toolCache.size).toBe(150);
    });

    it('should not evict when under MAX_CACHE_SIZE', () => {
      (executor as any).toolCache.set('key1', { result: 'val', timestamp: Date.now() });

      (executor as any).evictStaleCacheEntries();

      expect((executor as any).toolCache.size).toBe(1);
    });
  });

  describe('Tool Statistics', () => {
    it('should record tool call statistics', () => {
      executor.recordToolCall('Read', 100, false);
      executor.recordToolCall('Read', 200, false);
      executor.recordToolCall('Read', 150, true);

      const stats = executor.getToolStats();
      const readStats = stats.get('Read');

      expect(readStats).toBeDefined();
      expect(readStats!.calls).toBe(3);
      expect(readStats!.totalMs).toBe(450);
      expect(readStats!.errors).toBe(1);
    });

    it('should initialize stats for new tool', () => {
      executor.recordToolCall('NewTool', 50, false);

      const stats = executor.getToolStats();
      expect(stats.get('NewTool')).toEqual({
        calls: 1,
        totalMs: 50,
        errors: 0,
      });
    });

    it('should reset all stats', () => {
      executor.recordToolCall('Read', 100, false);
      (executor as any).toolCache.set('key', { result: 'val', timestamp: Date.now() });
      (executor as any).pendingReads.set('key', Promise.resolve('val'));

      executor.resetStats();

      expect(executor.getToolStats().size).toBe(0);
      expect((executor as any).toolCache.size).toBe(0);
      expect((executor as any).pendingReads.size).toBe(0);
    });
  });

  describe('Tool Execution', () => {
    it('should execute single tool', async () => {
      const mockReadTool: Tool = {
        name: 'TestRead',
        description: 'Read file',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('file content'),
      };

      registerTool(mockReadTool);

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'TestRead',
          input: { filePath: 'test.ts' },
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe('TestRead');
      expect(results[0].isError).toBe(false);
    });

    it('should execute multiple tools in parallel', async () => {
      const mockReadTool: Tool = {
        name: 'TestRead2',
        description: 'Read file',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('file content'),
      };

      const mockWriteTool: Tool = {
        name: 'TestWrite',
        description: 'Write file',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('written'),
      };

      registerTool(mockReadTool);
      registerTool(mockWriteTool);

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'TestRead2',
          input: { filePath: 'test.ts' },
        },
        {
          type: 'tool_use' as const,
          id: 'call_2',
          name: 'TestWrite',
          input: { filePath: 'out.ts', content: 'data' },
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      expect(results).toHaveLength(2);
      expect(results[0].tool).toBe('TestRead2');
      expect(results[1].tool).toBe('TestWrite');
    });

    it('should handle tool execution error', async () => {
      const errorTool: Tool = {
        name: 'ErrorTool',
        description: 'Fails',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

      registerTool(errorTool);

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'ErrorTool',
          input: {},
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      expect(results).toHaveLength(1);
      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('Tool failed');
    });

    it('should use cache for repeated calls', async () => {
      const mockTool = {
        name: 'CachedTool',
        description: 'Test',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('result'),
      };

      registerTool(mockTool as Tool);

      const block = {
        type: 'tool_use' as const,
        id: 'call_1',
        name: 'CachedTool',
        input: { key: 'value' },
      };

      // First call
      await executor.executeToolBatch([block], {} as any, null);
      expect(mockTool.execute).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await executor.executeToolBatch([block], {} as any, null);
      expect(mockTool.execute).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should deduplicate concurrent pending reads', async () => {
      let executeCount = 0;
      const slowTool: Tool = {
        name: 'SlowRead',
        description: 'Slow read',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockImplementation(async () => {
          executeCount++;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'content';
        }),
      };

      registerTool(slowTool);

      const block = {
        type: 'tool_use' as const,
        id: 'call_1',
        name: 'SlowRead',
        input: { filePath: 'test.ts' },
      };

      // Execute same call twice concurrently
      const [result1, result2] = await Promise.all([
        executor.executeToolBatch([block], {} as any, null),
        executor.executeToolBatch([block], {} as any, null),
      ]);

      // Should only execute once due to deduplication
      expect(executeCount).toBe(1);
      expect(result1[0].output).toBe(result2[0].output);
    });
  });

  describe('Permission Handling', () => {
    it('should handle permission denied', async () => {
      const restrictedTool: Tool = {
        name: 'DangerousTool',
        description: 'Needs permission',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('executed'),
      };

      registerTool(restrictedTool);

      // Mock permission check to deny
      vi.mock('../permission/index.js', () => ({
        checkPermission: vi.fn().mockResolvedValue(false),
      }));

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'DangerousTool',
          input: {},
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      expect(results).toHaveLength(1);
      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('permission');
    });
  });

  describe('Error Classification', () => {
    it('should classify file not found errors', async () => {
      const tool: Tool = {
        name: 'ReadFileNotFound',
        description: 'Read',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockRejectedValue(new Error('ENOENT: file not found')),
      };

      registerTool(tool);

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'ReadFileNotFound',
          input: { filePath: 'missing.ts' },
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('not found');
    });

    it('should classify permission errors', async () => {
      const tool: Tool = {
        name: 'WritePermDenied',
        description: 'Write',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
      };

      registerTool(tool);

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'WritePermDenied',
          input: { filePath: 'readonly.ts' },
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('permission');
    });
  });

  describe('Callback Integration', () => {
    it('should call onToolExecutionStart callback', async () => {
      const onToolExecutionStart = vi.fn();
      const callbacks = { onToolExecutionStart };

      const tool: Tool = {
        name: 'TestTool',
        description: 'Test',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('result'),
      };

      registerTool(tool);

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'TestTool',
          input: {},
        },
      ];

      await executor.executeToolBatch(blocks, callbacks as any, null);

      expect(onToolExecutionStart).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'call_1',
          name: 'TestTool',
          input: {},
        }),
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tool batch', async () => {
      const results = await executor.executeToolBatch([], {} as any, null);

      expect(results).toEqual([]);
    });

    it('should handle tool not found', async () => {
      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'NonExistentTool',
          input: {},
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      expect(results).toHaveLength(1);
      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('not found');
    });

    it('should handle malformed tool input', async () => {
      const strictTool: Tool = {
        name: 'StrictTool',
        description: 'Strict validation',
        inputSchema: {
          type: 'object',
          properties: { required: { type: 'string' } },
          required: ['required'],
        },
        execute: vi.fn().mockResolvedValue('result'),
      };

      registerTool(strictTool);

      const blocks = [
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'StrictTool',
          input: {}, // Missing required field
        },
      ];

      const results = await executor.executeToolBatch(blocks, {} as any, null);

      // Should still execute (validation happens elsewhere)
      expect(results).toHaveLength(1);
    });
  });
});
