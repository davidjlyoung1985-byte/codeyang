/**
 * AgentToolExecutor tests.
 *
 * Drives the real `executeToolBatch` path — permission gate, cache, read
 * deduplication, metrics recording and error classification — against a mocked
 * registry so every tool is defined by the test itself.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ToolDefinition } from '../types.js';

// The registry builds its tool list from a module-level cache; replacing
// `getTool` keeps the executor's lookup under test control without touching it.
const mockGetTool = vi.fn();
vi.mock('../tools/registry.js', () => ({
  getTool: (name: string) => mockGetTool(name),
}));

const mockCheckPermission = vi.fn();
vi.mock('../permission/index.js', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

import { AgentToolExecutor } from './AgentToolExecutor.js';
import { ReflexionEngine } from '../experimental/reflexion/ReflexionEngine.js';
import type { ToolResult } from '../types.js';

/** Records spans the way Tracer.traceAsync does, without any real tracing. */
function makeTracer() {
  const spans: Array<Record<string, unknown>> = [];
  return {
    spans,
    traceAsync: async (
      _traceId: string,
      _name: string,
      _kind: string,
      fn: (span: Record<string, unknown>) => Promise<unknown>,
    ) => {
      const span: Record<string, unknown> = { tags: {}, status: 'unset', error: undefined };
      spans.push(span);
      return fn(span);
    },
  };
}

interface BatchOverrides {
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  signal?: AbortSignal;
  cbs?: Record<string, unknown>;
  tracer?: ReturnType<typeof makeTracer>;
  setQuestionResolve?: (resolve: ((answer: string) => void) | null) => void;
}

describe('AgentToolExecutor', () => {
  let executor: AgentToolExecutor;
  let tracer: ReturnType<typeof makeTracer>;

  /** Invoke executeToolBatch with the real 6-argument signature. */
  async function runBatch(o: BatchOverrides = {}): Promise<{ results: ToolResult[]; ids: string[] }> {
    return executor.executeToolBatch(
      o.toolCalls ?? [],
      o.signal ?? new AbortController().signal,
      (o.cbs ?? {}) as never,
      'trace-1',
      (o.tracer ?? tracer) as never,
      o.setQuestionResolve ?? (() => {}),
    );
  }

  /** Register one tool the executor will see through the mocked registry. */
  function useTool(tool: Partial<ToolDefinition> & { name: string }): ToolDefinition {
    const full: ToolDefinition = {
      description: 'test tool',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn().mockResolvedValue('ok'),
      ...tool,
    };
    mockGetTool.mockImplementation((name: string) => (name === full.name ? full : undefined));
    return full;
  }

  beforeEach(() => {
    mockGetTool.mockReset();
    mockCheckPermission.mockReset();
    mockCheckPermission.mockResolvedValue({ level: 'allow' });

    executor = new AgentToolExecutor(new ReflexionEngine({ enabled: false } as never));
    tracer = makeTracer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Cache Management ─────────────────────────────────────

  describe('Cache Management', () => {
    it('invalidates every cache entry when no path is given', () => {
      (executor as never as { toolCache: Map<string, unknown> }).toolCache.set('Read:{"filePath":"a.ts"}', {
        result: 'content',
        timestamp: Date.now(),
      });

      executor.invalidateCache();

      expect((executor as never as { toolCache: Map<string, unknown> }).toolCache.size).toBe(0);
    });

    it('invalidates only entries referencing the given path', () => {
      const cache = (executor as never as { toolCache: Map<string, unknown> }).toolCache;
      cache.set('Read:{"filePath":"test.ts"}', { result: 'a', timestamp: Date.now() });
      cache.set('Read:{"filePath":"other.ts"}', { result: 'b', timestamp: Date.now() });

      executor.invalidateCache('test.ts');

      expect(cache.has('Read:{"filePath":"test.ts"}')).toBe(false);
      expect(cache.has('Read:{"filePath":"other.ts"}')).toBe(true);
    });

    it('falls back to substring matching when the key is not JSON', () => {
      const cache = (executor as never as { toolCache: Map<string, unknown> }).toolCache;
      cache.set('Read:invalid-json-test.ts', { result: 'content', timestamp: Date.now() });

      // Must not throw on unparseable keys.
      executor.invalidateCache('test.ts');

      expect(cache.has('Read:invalid-json-test.ts')).toBe(false);
    });

    it('evicts down to the cleanup threshold once the cache is oversized', () => {
      const cache = (executor as never as { toolCache: Map<string, unknown> }).toolCache;
      for (let i = 0; i < 250; i++) {
        cache.set(`key${i}`, { result: `r${i}`, timestamp: Date.now() + i });
      }

      (executor as never as { evictStaleCacheEntries: () => void }).evictStaleCacheEntries();

      expect(cache.size).toBe(150);
    });

    it('does not evict while the cache is under the limit', () => {
      const cache = (executor as never as { toolCache: Map<string, unknown> }).toolCache;
      cache.set('key1', { result: 'v', timestamp: Date.now() });

      (executor as never as { evictStaleCacheEntries: () => void }).evictStaleCacheEntries();

      expect(cache.size).toBe(1);
    });
  });

  // ── Tool Statistics ──────────────────────────────────────

  describe('Tool Statistics', () => {
    it('accumulates calls, total time and errors per tool', () => {
      executor.recordToolCall('Read', 100, false);
      executor.recordToolCall('Read', 200, false);
      executor.recordToolCall('Read', 150, true);

      const stats = executor.getToolStats().get('Read');

      expect(stats).toEqual({ calls: 3, totalMs: 450, errors: 1 });
    });

    it('initializes stats for a tool seen for the first time', () => {
      executor.recordToolCall('NewTool', 50, false);

      expect(executor.getToolStats().get('NewTool')).toEqual({ calls: 1, totalMs: 50, errors: 0 });
    });

    it('resetStats clears stats, cache and pending reads together', () => {
      executor.recordToolCall('Read', 100, false);
      const priv = executor as never as {
        toolCache: Map<string, unknown>;
        pendingReads: Map<string, unknown>;
      };
      priv.toolCache.set('k', { result: 'v', timestamp: Date.now() });
      priv.pendingReads.set('k', Promise.resolve('v'));

      executor.resetStats();

      expect(executor.getToolStats().size).toBe(0);
      expect(priv.toolCache.size).toBe(0);
      expect(priv.pendingReads.size).toBe(0);
    });
  });

  // ── Tool Execution ───────────────────────────────────────

  describe('Tool Execution', () => {
    it('executes a single tool and returns its output', async () => {
      const tool = useTool({ name: 'TestRead', execute: vi.fn().mockResolvedValue('file content') });

      const { results, ids } = await runBatch({
        toolCalls: [{ id: 'call_1', name: 'TestRead', input: { filePath: 'test.ts' } }],
      });

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe('TestRead');
      expect(results[0].output).toBe('file content');
      expect(results[0].isError).toBe(false);
      expect(ids).toEqual(['call_1']);
      expect(tool.execute).toHaveBeenCalledWith({ filePath: 'test.ts' });
    });

    it('executes multiple tools and preserves result order', async () => {
      useTool({ name: 'TestRead2', execute: vi.fn().mockResolvedValue('read') });
      mockGetTool.mockImplementation((name: string) =>
        name === 'TestRead2'
          ? { name: 'TestRead2', description: '', parameters: {}, execute: async () => 'read' }
          : name === 'TestWrite'
            ? { name: 'TestWrite', description: '', parameters: {}, execute: async () => 'written' }
            : undefined,
      );

      const { results } = await runBatch({
        toolCalls: [
          { id: 'call_1', name: 'TestRead2', input: { filePath: 'test.ts' } },
          { id: 'call_2', name: 'TestWrite', input: { filePath: 'out.ts', content: 'd' } },
        ],
      });

      expect(results.map((r) => r.tool)).toEqual(['TestRead2', 'TestWrite']);
      expect(results.map((r) => r.output)).toEqual(['read', 'written']);
    });

    it('reports a failing tool as an error result instead of throwing', async () => {
      useTool({ name: 'ErrorTool', execute: vi.fn().mockRejectedValue(new Error('Tool failed')) });

      const { results } = await runBatch({
        toolCalls: [{ id: 'call_1', name: 'ErrorTool', input: {} }],
      });

      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('Tool failed');
    });

    it('marks the trace span as failed and tags the error code', async () => {
      useTool({ name: 'BoomTool', execute: vi.fn().mockRejectedValue(new Error('kaboom')) });

      await runBatch({ toolCalls: [{ id: 'c1', name: 'BoomTool', input: {} }] });

      expect(tracer.spans[0].status).toBe('error');
      expect(tracer.spans[0].error).toContain('kaboom');
      expect(tracer.spans[0].tags).toMatchObject({ toolName: 'BoomTool' });
    });

    it('serves a repeated Read from cache without re-executing', async () => {
      const execute = vi.fn().mockResolvedValue('cached result');
      useTool({ name: 'Read', execute });

      const call = { id: 'call_1', name: 'Read', input: { filePath: 'test.ts' } };

      const first = await runBatch({ toolCalls: [call] });
      const second = await runBatch({ toolCalls: [call] });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(second.results[0].output).toBe(first.results[0].output);
    });

    it('deduplicates concurrent identical reads', async () => {
      let executeCount = 0;
      useTool({
        name: 'Read',
        execute: vi.fn().mockImplementation(async () => {
          executeCount++;
          await new Promise((r) => setTimeout(r, 30));
          return 'content';
        }),
      });

      const call = { id: 'call_1', name: 'Read', input: { filePath: 'same.ts' } };

      const [a, b] = await Promise.all([runBatch({ toolCalls: [call] }), runBatch({ toolCalls: [call] })]);

      expect(executeCount).toBe(1);
      expect(a.results[0].output).toBe(b.results[0].output);
    });

    it('invalidates the cache after a Write', async () => {
      const cache = (executor as never as { toolCache: Map<string, unknown> }).toolCache;
      cache.set('Read:{"filePath":"target.ts"}', { result: 'stale', timestamp: Date.now() });

      useTool({
        name: 'Write',
        execute: vi.fn().mockResolvedValue('written'),
      });

      await runBatch({ toolCalls: [{ id: 'c1', name: 'Write', input: { filePath: 'target.ts' } }] });

      expect(cache.has('Read:{"filePath":"target.ts"}')).toBe(false);
    });
  });

  // ── Permission Handling ──────────────────────────────────

  describe('Permission Handling', () => {
    it('blocks a denied tool without executing it', async () => {
      const execute = vi.fn().mockResolvedValue('executed');
      useTool({ name: 'Delete', execute });
      mockCheckPermission.mockResolvedValue({ level: 'deny', reason: 'Deleting node_modules' });

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'Delete', input: { path: 'node_modules' } }],
      });

      expect(execute).not.toHaveBeenCalled();
      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('PERMISSION DENIED');
      expect(results[0].output).toContain('Deleting node_modules');
    });

    it('fails closed with guidance when a rule requires confirmation', async () => {
      const execute = vi.fn().mockResolvedValue('executed');
      useTool({ name: 'Bash', execute });
      mockCheckPermission.mockResolvedValue({ level: 'ask', reason: 'rm -rf' });

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'Bash', input: { command: 'rm -rf /' } }],
      });

      expect(execute).not.toHaveBeenCalled();
      expect(results[0].output).toContain('PERMISSION REQUIRED');
      expect(results[0].output).toContain('permissions.json');
    });

    it('denies the call when the permission check itself throws', async () => {
      useTool({ name: 'Write' });
      mockCheckPermission.mockRejectedValue(new Error('broken permissions.json'));

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'Write', input: { filePath: 'a.ts' } }],
      });

      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('PERMISSION DENIED');
    });
  });

  // ── Error Classification ─────────────────────────────────

  describe('Error Classification', () => {
    it('classifies ENOENT as a file-not-found failure', async () => {
      useTool({ name: 'Read', execute: vi.fn().mockRejectedValue(new Error('ENOENT: no such file')) });

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'Read', input: { filePath: 'missing.ts' } }],
      });

      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('ENOENT');
    });

    it('annotates retryable failures so the agent can retry', async () => {
      useTool({ name: 'WebFetch', execute: vi.fn().mockRejectedValue(new Error('Request timeout after 30s')) });

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'WebFetch', input: { url: 'https://example.com' } }],
      });

      expect(results[0].output).toContain('retryable');
    });

    it('does not annotate non-retryable failures', async () => {
      useTool({ name: 'Read', execute: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')) });

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'Read', input: { filePath: 'x.ts' } }],
      });

      expect(results[0].output).not.toContain('retryable');
    });
  });

  // ── Unknown tools ────────────────────────────────────────

  describe('Unknown tools', () => {
    it('returns a structured not-found message instead of throwing', async () => {
      mockGetTool.mockReturnValue(undefined);

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'NonExistentTool', input: {} }],
      });

      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('TOOL_NOT_FOUND');
      expect(results[0].output).toContain('NonExistentTool');
    });
  });

  // ── Callbacks ────────────────────────────────────────────

  describe('Callbacks', () => {
    it('fires onToolBatch, onToolStart and onToolResult', async () => {
      useTool({ name: 'Read', execute: vi.fn().mockResolvedValue('data') });
      const cbs = { onToolBatch: vi.fn(), onToolStart: vi.fn(), onToolResult: vi.fn() };

      await runBatch({ toolCalls: [{ id: 'c1', name: 'Read', input: { filePath: 'a.ts' } }], cbs });

      expect(cbs.onToolBatch).toHaveBeenCalledWith(1);
      expect(cbs.onToolStart).toHaveBeenCalledWith('Read', { filePath: 'a.ts' });
      expect(cbs.onToolResult).toHaveBeenCalledWith('Read', 'data', false);
    });

    it('reports failures through onToolResult with isError=true', async () => {
      useTool({ name: 'Boom', execute: vi.fn().mockRejectedValue(new Error('nope')) });
      const cbs = { onToolResult: vi.fn() };

      await runBatch({ toolCalls: [{ id: 'c1', name: 'Boom', input: {} }], cbs });

      expect(cbs.onToolResult).toHaveBeenCalledWith('Boom', expect.stringContaining('nope'), true);
    });
  });

  // ── Cancellation & edge cases ────────────────────────────

  describe('Edge Cases', () => {
    it('handles an empty batch', async () => {
      const { results, ids } = await runBatch({ toolCalls: [] });

      expect(results).toEqual([]);
      expect(ids).toEqual([]);
    });

    it('does not execute anything once the signal is aborted', async () => {
      const execute = vi.fn().mockResolvedValue('ran');
      useTool({ name: 'Read', execute });

      const controller = new AbortController();
      controller.abort();

      const { results } = await runBatch({
        toolCalls: [{ id: 'c1', name: 'Read', input: { filePath: 'a.ts' } }],
        signal: controller.signal,
      });

      expect(execute).not.toHaveBeenCalled();
      expect(results[0].isError).toBe(true);
      expect(results[0].output).toContain('Cancelled');
    });

    it('runs the Question tool first and returns the user answer', async () => {
      useTool({ name: 'Question' });
      let resolveAnswer: ((a: string) => void) | null = null;

      const cbs = { onQuestion: vi.fn() };
      const batchPromise = runBatch({
        toolCalls: [{ id: 'c1', name: 'Question', input: { question: 'Proceed?' } }],
        cbs,
        setQuestionResolve: (r) => {
          resolveAnswer = r;
        },
      });

      // The Question tool blocks until the UI resolves; flush the microtask queue.
      await new Promise((r) => setTimeout(r, 0));
      expect(cbs.onQuestion).toHaveBeenCalledWith('Proceed?', undefined);
      resolveAnswer!('yes');

      const { results } = await batchPromise;
      expect(results[0].output).toBe('yes');
      expect(results[0].isError).toBe(false);
    });
  });
});
