/**
 * AgentToolExecutor — manages tool caching, deduplication (pending reads),
 * tool batch execution, and RL outcome recording for the Agent.
 */
import type { ToolResult } from '../types.js';
import type { AgentCallbacks } from './Agent.js';
import { getTool } from '../tools/registry.js';
import { recordToolOutcome } from '../tools/rl-weighter.js';
import { cacheKey } from './AgentUtils.js';
import { Tracer } from '../tracing/index.js';
import { ReflexionEngine } from '../reflexion/ReflexionEngine.js';
import { logger } from '../utils/logger.js';

// ── Defaults ───────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_SIZE = 200;
const CACHE_CLEANUP_THRESHOLD = 150;

/** A content block representing a tool use request. */
export type AssistantToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

/** A content block representing a tool result. */
export type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
};

// ── Tool execution info for callbacks ──────────────────────

export interface ToolExecution {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export class AgentToolExecutor {
  // Tool result cache: LRU eviction
  private toolCache = new Map<string, { result: string; timestamp: number }>();

  // Pending reads: deduplicate concurrent Read/Glob calls for the same key
  private pendingReads = new Map<string, Promise<string>>();

  // Per-tool usage statistics
  private toolStats = new Map<string, { calls: number; totalMs: number; errors: number }>();

  // Reflexion engine (for recording failures)
  private reflexionEngine: ReflexionEngine;

  constructor(reflexionEngine: ReflexionEngine) {
    this.reflexionEngine = reflexionEngine;
  }

  /** Invalidate tool cache. If filePath given, only invalidate entries referencing that path. */
  invalidateCache(filePath?: string): void {
    if (!filePath) {
      this.toolCache.clear();
      return;
    }
    for (const [key] of this.toolCache) {
      try {
        const colonIdx = key.indexOf(':');
        if (colonIdx === -1) continue;
        const argsJson = key.slice(colonIdx + 1);
        const args = JSON.parse(argsJson) as Record<string, unknown>;
        const cachedPath = (args.filePath || args.pattern || '') as string;
        if (cachedPath === filePath) {
          this.toolCache.delete(key);
        }
      } catch {
        if (key.includes(filePath)) {
          this.toolCache.delete(key);
        }
      }
    }
  }

  /** Evict oldest cache entries when the cache grows too large (LRU). */
  private evictStaleCacheEntries(): void {
    if (this.toolCache.size <= MAX_CACHE_SIZE) return;

    const entries = [...this.toolCache.entries()]
      .map(([key, val]) => ({ key, timestamp: val.timestamp }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const toDelete = this.toolCache.size - CACHE_CLEANUP_THRESHOLD;
    for (let i = 0; i < toDelete && i < entries.length; i++) {
      this.toolCache.delete(entries[i].key);
      this.pendingReads.delete(entries[i].key);
    }
  }

  /** Record a tool call for usage statistics and RL weighting. */
  recordToolCall(name: string, ms: number, isError: boolean): void {
    const s = this.toolStats.get(name) || { calls: 0, totalMs: 0, errors: 0 };
    s.calls++;
    s.totalMs += ms;
    if (isError) s.errors++;
    this.toolStats.set(name, s);

    recordToolOutcome(name, !isError, ms, isError ? `Error in ${name}` : undefined).catch((err) =>
      logger.warn('[RL] Failed to record tool outcome:', err instanceof Error ? err.message : err),
    );
  }

  /** Get per-tool usage statistics. */
  getToolStats(): ReadonlyMap<string, { calls: number; totalMs: number; errors: number }> {
    return this.toolStats;
  }

  // ── Tool batch execution ─────────────────────────────────

  /**
   * Execute a batch of tool calls. Question tool runs first (blocking, user input).
   * All other tools run in parallel.
   */
  async executeToolBatch(
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    signal: AbortSignal,
    cbs: AgentCallbacks,
    traceId: string,
    tracer: Tracer,
    setQuestionResolve: (resolve: ((answer: string) => void) | null) => void,
  ): Promise<{ results: ToolResult[]; ids: string[] }> {
    const toolResults: ToolResult[] = [];
    const toolResultIds: string[] = [];
    cbs.onToolBatch?.(toolCalls.length);

    // 1) Handle Question tool first (blocking — waits for user input)
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      toolResultIds[i] = tc.id;
      if (tc.name === 'Question') {
        if (signal.aborted) {
          toolResults[i] = { tool: tc.name, input: tc.input, output: 'Cancelled by user', isError: true };
          continue;
        }
        const t0 = Date.now();
        const q = String(tc.input['question'] ?? '');
        const options = Array.isArray(tc.input['options'])
          ? (tc.input['options'] as Array<{ label: string; description: string }>)
          : undefined;
        cbs.onQuestion?.(q, options);
        const answer = await new Promise<string>((resolve) => {
          setQuestionResolve(resolve);
        });
        this.recordToolCall(tc.name, Date.now() - t0, false);
        toolResults[i] = { tool: tc.name, input: tc.input, output: answer, isError: false };
      }
    }

    // 2) Execute non-Question tools in parallel
    await Promise.all(
      toolCalls.map(async (tc, i) => {
        if (tc.name === 'Question') return;
        if (signal.aborted) {
          toolResults[i] = { tool: tc.name, input: tc.input, output: 'Cancelled by user', isError: true };
          return;
        }

        try {
          toolResultIds[i] = tc.id;
          const tool = getTool(tc.name);
          if (!tool) {
            toolResults[i] = { tool: tc.name, input: tc.input, output: `Unknown: ${tc.name}`, isError: true };
            cbs.onToolResult?.(tc.name, `Unknown: ${tc.name}`, true);
            return;
          }
          cbs.onToolStart?.(tc.name, tc.input);

          // Check cache for Read/Glob
          const cacheable = tc.name === 'Read' || tc.name === 'Glob';
          const ck = cacheable ? cacheKey(tc.name, tc.input) : undefined;
          if (ck) {
            const cached = this.toolCache.get(ck);
            if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
              toolResults[i] = { tool: tc.name, input: tc.input, output: cached.result, isError: false };
              return;
            }
            // Deduplicate concurrent reads
            const pending = this.pendingReads.get(ck);
            if (pending) {
              try {
                const output = await pending;
                toolResults[i] = { tool: tc.name, input: tc.input, output, isError: false };
                cbs.onToolResult?.(tc.name, output, false);
                return;
              } catch (err) {
                if (process.env.CODEYANG_DEBUG) {
                  console.warn(`[AgentToolExecutor] Pending read failed for ${tc.name}, retrying:`, err);
                }
              }
            }
          }

          const t0 = Date.now();
          await tracer.traceAsync(traceId, `tool.${tc.name}`, 'tool', async (span) => {
            span.tags.toolName = tc.name;
            span.tags.relatedId = JSON.stringify(tc.input).slice(0, 100);

            try {
              const executePromise = tool.execute(tc.input);
              if (ck) this.pendingReads.set(ck, executePromise);
              const output = await executePromise;
              this.recordToolCall(tc.name, Date.now() - t0, false);
              toolResults[i] = { tool: tc.name, input: tc.input, output, isError: false };
              cbs.onToolResult?.(tc.name, output, false);
              if (ck) {
                this.toolCache.set(ck, { result: output, timestamp: Date.now() });
                this.pendingReads.delete(ck);
                this.evictStaleCacheEntries();
              }
              if (tc.name === 'Write' || tc.name === 'Edit') {
                const writtenPath = String((tc.input as Record<string, unknown>)['filePath'] ?? '');
                this.invalidateCache(writtenPath || undefined);
              }
              span.status = 'ok';
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              this.recordToolCall(tc.name, Date.now() - t0, true);
              toolResults[i] = { tool: tc.name, input: tc.input, output: errorMsg, isError: true };
              cbs.onToolResult?.(tc.name, errorMsg, true);
              if (ck) this.pendingReads.delete(ck);
              span.status = 'error';
              span.error = errorMsg.slice(0, 200);

              // Reflexion: record tool execution failure
              this.reflexionEngine.recordExecution({
                task: tc.name,
                toolCalls: [{ id: tc.id, name: tc.name, args: tc.input }],
                results: [{ tool: tc.name, input: tc.input, output: errorMsg, isError: true }],
                success: false,
                errorMessage: errorMsg.slice(0, 200),
                durationMs: Date.now() - t0,
                timestamp: Date.now(),
              });
            }
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toolResults[i] = {
            tool: tc.name,
            input: tc.input,
            output: `Unexpected error in tool executor: ${errMsg}`,
            isError: true,
          };
          toolResultIds[i] = tc.id;

          this.reflexionEngine.recordExecution({
            task: tc.name,
            toolCalls: [{ id: tc.id, name: tc.name, args: tc.input }],
            results: [{ tool: tc.name, input: tc.input, output: errMsg, isError: true }],
            success: false,
            errorMessage: errMsg.slice(0, 200),
            durationMs: 0,
            timestamp: Date.now(),
          });
        }
      }),
    );

    return { results: toolResults, ids: toolResultIds };
  }
}
