import type { Message, ToolCall, ToolResult } from '../types.js';
import { config } from './config.js';
import { toolSchemas, getTool, setToolContext } from '../tools/registry.js';
import type { QtContext } from '../qt/index.js';
import { createLLMClient, type LLMClient, type LLMMessage } from './LLMClient.js';
import { getMemorySummary, getMemoryVersion } from '../utils/memoryStore.js';
import { logger } from '../utils/logger.js';
import { VerificationPipeline, type VerificationResult } from '../closed-loop/VerificationPipeline.js';
import { FeedbackInjector } from '../closed-loop/FeedbackInjector.js';
import type { WatcherSystem } from '../closed-loop/WatcherSystem.js';
import { ReflexionEngine } from '../reflexion/ReflexionEngine.js';
import { CritiqueEngine } from '../reflexion/CritiqueEngine.js';
import { Planner } from '../planner/Planner.js';
import { TreeOfThoughts } from '../tot/TreeOfThoughts.js';
import { recordToolOutcome, getAllToolWeights } from '../tools/rl-weighter.js';
import { runConsolidation } from '../continual-learning/MemoryManager.js';
import { A2AProtocol, globalAgentRegistry } from '../a2a/A2AProtocol.js';
import { Tracer } from '../tracing/index.js';
import { CircuitBreakerManager, type CircuitBreakerStats } from '../circuit-breaker/index.js';
import { Gateway } from '../gateway/index.js';

/** A content block emitted by the assistant (text or tool_use). */
type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

/** A tool_result block returned from tool execution. */
type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
};

export interface AgentCallbacks {
  onUserMessage?: (text: string) => void;
  onAgentText?: (text: string) => void;
  onAgentDelta?: (text: string) => void;
  onToolBatch?: (total: number) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, output: string, isError: boolean) => void;
  onQuestion?: (question: string, options?: Array<{ label: string; description: string }>) => void;
  onError?: (err: string) => void;
}

export class Agent {
  private static readonly CACHE_TTL_MS = 30_000;
  private static readonly MAX_RETRY_DELAY_MS = 30_000;
  private static readonly SIMILARITY_PREFIX_LEN = 100;
  private static readonly MAX_RECENT_TEXTS = 4;
  private static readonly MIN_REPEAT_TEXTS_FOR_FUZZY = 2;
  private static readonly CONTEXT_SOFT_LIMIT = 200;
  private static readonly CONTEXT_KEEP_RECENT = 50;
  private static readonly DECISION_MAX_LEN = 200;
  private static readonly DECISION_TRUNCATE = 150;
  private static readonly FILE_LIST_TRUNCATE = 300;
  private static readonly TOP_TOOLS_COUNT = 10;
  private static readonly KEY_DECISIONS_COUNT = 5;
  private static readonly MAX_CHECKPOINTS = 10;
  private static readonly TOOL_TIMEOUT_MS = (() => {
    const raw = process.env['CODEYANG_TOOL_TIMEOUT'];
    if (raw === undefined) return 30_000;
    const val = Number(raw);
    return Number.isNaN(val) ? 30_000 : val;
  })(); // 单个工具超时

  private client: LLMClient;
  private history: LLMMessage[] = [];
  private cbs: AgentCallbacks = {};
  private checkpoints: LLMMessage[][] = [];
  private questionResolve: ((answer: string) => void) | null = null;
  private maxRetries: number;

  // Tool result cache: avoid re-reading unchanged files within a session
  // LRU eviction: when MAX_CACHE_SIZE is exceeded, oldest entries are purged
  private static readonly MAX_CACHE_SIZE = 200;
  private static readonly CACHE_CLEANUP_THRESHOLD = 150;
  private toolCache = new Map<string, { result: string; timestamp: number }>();

  // Pending reads �?deduplicate concurrent Read/Glob calls for the same key
  private pendingReads = new Map<string, Promise<string>>();

  // Anti-repetition: track previous assistant texts (fuzzy dedup)
  private lastAssistantText = '';
  private recentAssistantTexts: string[] = [];
  private repeatCount = 0;

  // 流式响应超时保护 —�?防止 LLM 卡住
  private static readonly STREAM_TIMEOUT_MS = 120_000; // 2分钟无新事件则超�?
  // Cancellation support for running tool batches
  private abortController: AbortController | null = null;

  // Token usage tracking across turns
  private tokenUsage = { inputTokens: 0, outputTokens: 0 };

  // Per-tool usage statistics for /stats command
  private toolStats = new Map<string, { calls: number; totalMs: number; errors: number }>();

  // Persistent memory cache with version tracking
  private memorySummary: string | null = null;
  private memoryLoadFailure = false;
  private lastMemoryVersion = -1;
  private cachedSystemPrompt: string | null = null;
  private cachedSystemPromptVersion = -1;

  // Closed-loop: verification pipeline & feedback injector
  private verificationPipeline: VerificationPipeline | null = null;
  private feedbackInjector = new FeedbackInjector();
  private watcher: WatcherSystem | null = null;

  // Reflexion: self-improvement via failure pattern learning
  private reflexionEngine: ReflexionEngine;

  // Self-Critique: quality review of agent's own output
  private critiqueEngine: CritiqueEngine;

  // Planner: plan-and-solve for complex tasks
  private planner: Planner;

  // Tree-of-Thoughts: parallel exploration of multiple solutions
  private treeOfThoughts: TreeOfThoughts;

  // A2A: direct agent-to-agent communication
  private a2aProtocol: A2AProtocol;

  // Continual Learning: auto-consolidation counter
  private consolidationCounter = 0;

  // ── Harness: Tracer (L5 全链路追踪) ──
  private tracer: Tracer;
  private currentTraceId = '';

  // ── Harness: CircuitBreaker (L6 熔断器) ──
  private circuitBreakerManager: CircuitBreakerManager;

  // ── Harness: Gateway (L1 API 网关) ──
  private gateway: Gateway;

  /**
   * Run self-critique on assistant output.
   *
   * Reviews the quality of the agent's response and provides feedback
   * if improvements are needed.
   */
  private async runSelfCritique(
    assistantText: string,
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    toolResults: ToolResult[],
    messages: LLMMessage[],
  ): Promise<void> {
    if (!assistantText || this.critiqueEngine.getIterationCount()) {
      return;
    }

    const critiqueResult = await this.critiqueEngine.checkAndImprove(
      this.client,
      config.model,
      config.maxTokens,
      assistantText,
      toolCalls,
      toolResults,
    );

    if (!critiqueResult.passed && critiqueResult.critiqueMessage) {
      messages.push({ role: 'user', content: critiqueResult.critiqueMessage });
      this.cbs.onToolResult?.(
        'Self-Critique',
        `Quality score: ${critiqueResult.critique?.score}/100 — issues found`,
        false,
      );
    } else if (critiqueResult.critique) {
      this.cbs.onToolResult?.('Self-Critique', `Quality score: ${critiqueResult.critique?.score}/100 — passed`, false);
    }
  }

  constructor(private qtContext?: QtContext) {
    this.client = createLLMClient(config.provider, config.apiKey, config.baseURL);
    this.reflexionEngine = new ReflexionEngine(config.reflexion);
    this.critiqueEngine = new CritiqueEngine();
    this.planner = new Planner(config.planner);
    this.treeOfThoughts = new TreeOfThoughts();
    this.a2aProtocol = new A2AProtocol({}, globalAgentRegistry);
    this.maxRetries = config.maxRetries ?? 3;

    // Harness 组件
    this.tracer = Tracer.getInstance();
    this.circuitBreakerManager = new CircuitBreakerManager();
    this.circuitBreakerManager.setDefaultConfig({
      failureThreshold: Number(process.env['CODEYANG_CB_THRESHOLD'] || '5'),
      resetTimeoutMs: Number(process.env['CODEYANG_CB_RESET_MS'] || '30000'),
      slowCallThresholdMs: Number(process.env['CODEYANG_CB_SLOW_MS'] || '30000'),
      windowSize: Number(process.env['CODEYANG_CB_WINDOW'] || '50'),
      failureRateThreshold: Number(process.env['CODEYANG_CB_RATE'] || '0.5'),
      minRequestCount: Number(process.env['CODEYANG_CB_MIN_REQ'] || '10'),
    });
    // 注册 LLM 熔断器
    this.circuitBreakerManager.create('llm-api', {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      slowCallThresholdMs: 30_000,
    });
    // 注册工具执行熔断器
    this.circuitBreakerManager.create('tool-execute', {
      failureThreshold: 10,
      resetTimeoutMs: 15_000,
      slowCallThresholdMs: 60_000,
    });
    this.gateway = Gateway.getInstance();

    // Register with A2A protocol
    globalAgentRegistry.register(this.a2aProtocol.getMyCard());
    this.a2aProtocol.setLLMClient(this.client, config.model, config.maxTokens);
  }

  setWatcher(watcher: WatcherSystem | null): void {
    this.watcher = watcher;
  }

  setVerificationPipeline(pipeline: VerificationPipeline | null): void {
    this.verificationPipeline = pipeline;
  }

  get pendingFeedback(): boolean {
    return this.feedbackInjector.hasPending();
  }

  /** Get the LLM client (for reflexion / planner to call directly). */
  getLLMClient(): LLMClient {
    return this.client;
  }

  /** Sanitize error messages to prevent API key leaks */
  private sanitizeErrorMessage(msg: string): string {
    return msg.replace(/\b(sk-|deepseek-r-|anthropic-)[a-zA-Z0-9_-]{10,}\b/gi, '[API_KEY_REDACTED]');
  }

  /** Get the reflexion engine (for status / manual reflection). */
  getReflexionEngine(): ReflexionEngine {
    return this.reflexionEngine;
  }

  /** Get the planner (for status / plan listing). */
  getPlanner(): Planner {
    return this.planner;
  }

  // ── Harness 组件访问器 ──

  getTracer(): Tracer {
    return this.tracer;
  }

  getCircuitBreakerManager(): CircuitBreakerManager {
    return this.circuitBreakerManager;
  }

  getGateway(): Gateway {
    return this.gateway;
  }

  /** 获取当前 trace ID（用于外部 span 关联） */
  getCurrentTraceId(): string {
    return this.currentTraceId;
  }

  /** 获取 Harness 系统整体状态摘要 */
  getHarnessStatus(): Record<string, unknown> {
    const cbStats = this.circuitBreakerManager.getAllStats();
    const traces = this.tracer.getTraces(5);
    // AuditLogger.getStats() 只在 ConsoleAuditLogger 上存在
    let auditOps = 0;
    let auditReqs = 0;
    try {
      const auditLogger = this.gateway.getAuditLogger() as unknown as {
        getStats: () => Record<string, { total: number; failed: number; avgMs: number }>;
      };
      if (typeof auditLogger.getStats === 'function') {
        const auditStats = auditLogger.getStats();
        auditOps = Object.keys(auditStats).length;
        auditReqs = Object.values(auditStats).reduce((sum, s) => sum + s.total, 0);
      }
    } catch (err) {
      // Best-effort stats collection - failure is non-critical
      if (process.env.CODEYANG_DEBUG) {
        console.warn('[Agent] Failed to collect audit stats:', err);
      }
    }
    return {
      tracing: {
        enabled: this.tracer.isEnabled(),
        recentTraces: traces.length,
        totalSpans: traces.reduce((s, t) => s + t.spanCount, 0),
      },
      circuitBreakers: (cbStats as CircuitBreakerStats[]).map((s) => ({
        name: s.name,
        state: s.state,
        failureRate: s.failureRate,
        totalCalls: s.totalCalls,
        openCount: s.openCount,
        isDegraded: s.isDegraded,
      })),
      gateway: {
        operations: auditOps,
        totalRequests: auditReqs,
      },
    };
  }

  /** Get closed-loop system status summary. */
  getClosedLoopStatus(): Record<string, unknown> {
    const reflexionStats = this.reflexionEngine.getStats();
    const recentExecs = this.reflexionEngine.getRecentExecutions(3);
    const consecutiveFails =
      recentExecs.length >= 2 && recentExecs.every((r) => !r.success)
        ? recentExecs.filter((r) => !r.success).length
        : 0;

    // Get RL tool statistics
    const toolWeights = getAllToolWeights();
    const topTools = toolWeights
      .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight)
      .slice(0, 5)
      .map((t: { name: string; weight: number; successRate: number; calls: number }) => ({
        name: t.name,
        weight: t.weight.toFixed(2),
        successRate: `${(t.successRate * 100).toFixed(0)}%`,
        calls: t.calls,
      }));

    return {
      autoVerify: config.autoVerify && !!this.verificationPipeline,
      autoFixOnError: config.autoFixOnError,
      watchMode: config.watchMode && !!this.watcher,
      reflexion: {
        enabled: config.reflexion.enabled,
        consecutiveFailures: consecutiveFails,
        totalReflections: 0, // ReflexionEngine doesn't expose this directly
        recentErrors: reflexionStats.failed,
      },
      planner: {
        enabled: config.planner.enabled,
        activePlans: this.planner.getActivePlans().length,
        totalPlans: this.planner.getAllPlans().length,
      },
      rlWeights: {
        enabled: true,
        topPerformingTools: topTools,
        totalToolCalls: toolWeights.reduce((sum: number, t: { calls: number }) => sum + t.calls, 0),
      },
    };
  }

  private async ensureMemoryLoaded(): Promise<string> {
    let currentVersion = -1;
    try {
      currentVersion = getMemoryVersion();
    } catch (err) {
      // Memory system unavailable - agent can still function without memory
      this.memoryLoadFailure = true;
      if (process.env.CODEYANG_DEBUG) {
        console.warn('[Agent] Failed to get memory version:', err);
      }
      return '';
    }
    // Re-read only when version changes �?avoids defeating LLM prompt caching
    if (this.memorySummary !== null && currentVersion === this.lastMemoryVersion) {
      return this.memorySummary;
    }
    if (this.memoryLoadFailure) return '';

    try {
      this.memorySummary = await getMemorySummary();
      this.lastMemoryVersion = currentVersion;
      this.memoryLoadFailure = false;
    } catch (err) {
      // Memory load failed - continue without memory context
      this.memoryLoadFailure = true;
      this.memorySummary = '';
      console.warn('[Agent] Failed to load memory summary:', err instanceof Error ? err.message : String(err));
    }
    return this.memorySummary ?? '';
  }

  /** Get cached system prompt, only rebuilds when memory version changes. */
  private async getSystemPrompt(): Promise<string> {
    const memVersion = getMemoryVersion();
    if (this.cachedSystemPrompt !== null && memVersion === this.cachedSystemPromptVersion) {
      return this.cachedSystemPrompt;
    }
    const memoryContext = await this.ensureMemoryLoaded();
    let prompt = memoryContext
      ? config.getSystemPrompt(this.qtContext) + '\n\n## Your Memory\n' + memoryContext
      : config.getSystemPrompt(this.qtContext);

    // Inject reflexion-learned patterns (auto-improvement from past failures)
    if (config.reflexion.autoInject) {
      const learnedPatterns = await this.reflexionEngine.getLearnedPatterns(3);
      if (learnedPatterns) {
        prompt += '\n\n## Learned Patterns (from past failures)\n' + learnedPatterns;
      }
    }

    // Inject RL tool weights (adaptive tool selection based on success rates)
    const toolWeights = getAllToolWeights();
    if (toolWeights.length > 0) {
      const topTools = toolWeights
        .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight)
        .slice(0, 10)
        .filter((t: { calls: number }) => t.calls > 2); // Only show tools with enough data

      if (topTools.length > 0) {
        prompt += '\n\n## Tool Performance (RL-based recommendations)\n';
        prompt += 'Based on past performance, prefer these tools when applicable:\n';
        topTools.forEach((tool: { name: string; successRate: number; calls: number }) => {
          const successRate = (tool.successRate * 100).toFixed(0);
          prompt += `- ${tool.name}: ${successRate}% success rate (${tool.calls} uses)\n`;
        });
        prompt += '\nLower-performing tools may still be appropriate for specific tasks.\n';
      }
    }

    this.cachedSystemPrompt = prompt;
    this.cachedSystemPromptVersion = memVersion;
    return prompt;
  }

  private cacheKey(name: string, args: Record<string, unknown>): string {
    return `${name}:${JSON.stringify(args)}`;
  }

  /** Invalidate tool cache. If a filePath is provided, only invalidate entries referencing that exact path. */
  private invalidateCache(filePath?: string) {
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
        // JSON parse failed - use fallback pattern matching
        if (key.includes(filePath)) {
          this.toolCache.delete(key);
        }
      }
    }
  }

  /** Evict oldest cache entries when the cache grows too large (LRU). */
  private evictStaleCacheEntries(): void {
    if (this.toolCache.size <= Agent.MAX_CACHE_SIZE) return;

    const entries = [...this.toolCache.entries()]
      .map(([key, val]) => ({ key, timestamp: val.timestamp }))
      .sort((a, b) => a.timestamp - b.timestamp); // oldest first

    const toDelete = this.toolCache.size - Agent.CACHE_CLEANUP_THRESHOLD;
    for (let i = 0; i < toDelete && i < entries.length; i++) {
      this.toolCache.delete(entries[i].key);
      this.pendingReads.delete(entries[i].key);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const isRetryable =
          err instanceof Error &&
          (err.message.includes('rate_limit') ||
            err.message.includes('Rate exceeded') ||
            err.message.includes('429') ||
            err.message.includes('529') ||
            err.message.includes('server error') ||
            err.message.includes('503') ||
            err.message.includes('timeout') ||
            err.message.includes('network') ||
            err.message.includes('ECONNRESET') ||
            err.message.includes('ETIMEDOUT'));

        if (attempt < this.maxRetries && isRetryable) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), Agent.MAX_RETRY_DELAY_MS);
          const delayStr = delay >= 1000 ? `${(delay / 1000).toFixed(1)}s` : `${delay}ms`;
          this.cbs.onError?.(
            `⚠️ ${label} failed (attempt ${attempt}/${this.maxRetries})\n` +
              `  💡 Retrying in ${delayStr}...\n` +
              `  📝 Reason: ${err.message}`,
          );
          await this.sleep(delay);
          continue;
        }

        // Final failure - provide actionable feedback
        if (isRetryable) {
          const errMsg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `🔴 ${label} failed after ${this.maxRetries} attempts\n` +
              `  💡 Last error: ${this.sanitizeErrorMessage(errMsg)}\n` +
              `  📝 Try:\n` +
              `    1) Check your network connection\n` +
              `    2) Verify API endpoint is accessible\n` +
              `    3) Check API key and rate limits\n` +
              `    4) Wait a moment and retry manually`,
          );
        }
        throw err;
      }
    }
    throw new Error(`${label} failed after ${this.maxRetries} attempts`);
  }

  setCallbacks(cbs: AgentCallbacks) {
    this.cbs = cbs;
  }

  get apiKeySet(): boolean {
    return config.apiKey.length > 0;
  }

  /** Get accumulated token usage across all turns */
  getTokenUsage(): { inputTokens: number; outputTokens: number } {
    return { ...this.tokenUsage };
  }

  /** Save a checkpoint of the current conversation history */
  saveCheckpoint(): number {
    const idx = this.checkpoints.length;
    this.checkpoints.push(this.jsonClone(this.history));

    // Limit checkpoint memory: keep only the most recent MAX_CHECKPOINTS
    if (this.checkpoints.length > Agent.MAX_CHECKPOINTS) {
      this.checkpoints.shift(); // Remove oldest checkpoint
      return idx - 1; // Adjust index since we removed one
    }

    return idx;
  }

  /** Restore to the most recent checkpoint. Returns false if none available. */
  restoreCheckpoint(): boolean {
    if (this.checkpoints.length === 0) return false;
    const saved = this.checkpoints.pop()!;
    this.history = saved;
    return true;
  }

  /** Number of saved checkpoints */
  get checkpointCount(): number {
    return this.checkpoints.length;
  }

  /** Clear conversation history and start fresh */
  reset() {
    this.history = [];
    this.invalidateCache();
    this.lastAssistantText = '';
    this.recentAssistantTexts = [];
    this.repeatCount = 0;
    this.tokenUsage = { inputTokens: 0, outputTokens: 0 };
    this.toolStats.clear();
    this.cachedSystemPrompt = null;
    this.cachedSystemPromptVersion = -1;
  }

  answerQuestion(answer: string) {
    if (this.questionResolve) {
      this.questionResolve(answer);
      this.questionResolve = null;
    }
  }

  /** Cancel a pending question (called on SIGINT to prevent hanging) */
  cancelQuestion() {
    if (this.questionResolve) {
      this.questionResolve('[Cancelled by user]');
      this.questionResolve = null;
    }
  }

  /** Cancel the currently running tool batch (called on SIGINT) */
  cancelRunningTools() {
    if (this.abortController) {
      this.abortController.abort();
      // Don't set to null here — let the run() loop clean it up naturally.
      // If we null it now, a subsequent tool batch would create a fresh
      // un-aborted controller that can't be cancelled again.
    }
  }

  get waitingForAnswer(): boolean {
    return this.questionResolve !== null;
  }

  private jsonClone<T>(obj: T): T {
    // Handle null/undefined before typeof check (typeof null === 'object')
    if (obj === null || obj === undefined) return obj;
    // Primitive types: return as-is (no cloning needed)
    if (typeof obj !== 'object') return obj;

    // Estimate object size to avoid OOM on large objects
    const estimatedSize = this.estimateObjectSize(obj);
    const MAX_SAFE_SIZE = 100 * 1024 * 1024; // 100MB

    if (estimatedSize > MAX_SAFE_SIZE) {
      // For very large objects, use shallow copy to avoid OOM
      // This is acceptable because we mainly clone LLM messages which are not deeply nested
      if (Array.isArray(obj)) {
        return [...obj] as T;
      }
      return { ...obj } as T;
    }

    // Node >= 17+ has structuredClone natively — use it as primary method
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(obj);
      } catch (err) {
        // structuredClone failed (e.g., circular reference, unsupported type)
        // Fallback to JSON round-trip
        if (process.env.CODEYANG_DEBUG) {
          console.warn(`[Agent] structuredClone failed, using JSON fallback:`, err);
        }
      }
    }

    // Fallback: JSON round-trip (safe for serializable objects)
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (err) {
      throw new Error(`[Agent] jsonClone failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Estimate object size in bytes (rough approximation).
   * Used to prevent OOM when cloning very large objects.
   */
  private estimateObjectSize(obj: unknown): number {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj === 'string') return obj.length * 2; // UTF-16 chars
    if (typeof obj === 'number') return 8; // 64-bit number
    if (typeof obj === 'boolean') return 4;
    if (typeof obj !== 'object') return 0;

    let size = 0;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        size += this.estimateObjectSize(item);
        if (size > 100 * 1024 * 1024) return size; // Early exit
      }
    } else {
      for (const value of Object.values(obj as Record<string, unknown>)) {
        size += this.estimateObjectSize(value);
        if (size > 100 * 1024 * 1024) return size; // Early exit
      }
    }
    return size;
  }

  /** Check if text is near-duplicate of any recent response (simple prefix match). */
  private computeSimilarity(text: string): number {
    if (this.recentAssistantTexts.length === 0) return 0;
    const prefix = text.slice(0, Agent.SIMILARITY_PREFIX_LEN).toLowerCase();
    // Exact prefix match with any of the last 4 responses �?treat as repeat
    for (const prev of this.recentAssistantTexts) {
      if (prev.slice(0, Agent.SIMILARITY_PREFIX_LEN).toLowerCase() === prefix) return 1.0;
    }
    return 0;
  }

  /**
   * 估算消息数组的 token 数，使用混合策略提升精度。
   *
   * - 英文单词: ~1.3 tokens/word（基于 GPT/Claude 词级 tokenization 经验值）
   * - CJK 字符: ~1.5 chars/token（每个汉字通常不到 1 token）
   * - 数字: ~3 chars/token（数字序列压缩效率高）
   * - 代码/符号: ~2 chars/token（特殊字符密集排列）
   *
   * 比单一大小的估算精度提升约 30-50%，避免过早或过晚触发截断。
   */
  private estimateMessageTokens(messages: LLMMessage[]): number {
    let total = 0;

    const estimateString = (s: string) => {
      if (!s) return;
      let cjkChars = 0;
      let digits = 0;
      let alphaChars = 0;
      let otherChars = 0;

      for (const ch of s) {
        const code = ch.charCodeAt(0);
        // CJK
        if (
          (code >= 0x4e00 && code <= 0x9fff) ||
          (code >= 0x3000 && code <= 0x303f) ||
          (code >= 0x3400 && code <= 0x4dbf)
        ) {
          cjkChars++;
        } else if (ch >= '0' && ch <= '9') {
          digits++;
        } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
          alphaChars++;
        } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          // whitespace
        } else {
          otherChars++;
        }
      }

      // 英文按单词算（比按字母更准）
      // 简单近似: 5 个字母 = 1 个单词平均
      const words = alphaChars / 5;
      total += words * 1.3; // 1.3 tokens/word

      // CJK: ~1.5 chars/token
      total += cjkChars / 1.5;

      // 数字: ~3 chars/token
      total += digits / 3;

      // 符号/代码: ~2 chars/token
      total += otherChars / 2;

      // 空格不计入
    };

    for (const m of messages) {
      if (typeof m.content === 'string') {
        estimateString(m.content);
      } else if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if ('text' in b && typeof b.text === 'string') estimateString(b.text);
          if ('content' in b && typeof b.content === 'string') estimateString(b.content);
          if ('input' in b && typeof b.input === 'object') estimateString(JSON.stringify(b.input));
        }
      }
    }

    // 加一个安全余量（5%），防止低估
    return Math.ceil(total * 1.05);
  }

  /** If history exceeds the soft limit, replace older messages with a structured summary. */
  private summarizeContext(messages: LLMMessage[]): LLMMessage[] {
    logger.debug(`[summarizeContext] input length: ${messages.length}, SOFT_LIMIT: ${Agent.CONTEXT_SOFT_LIMIT}`);
    if (messages.length <= Agent.CONTEXT_SOFT_LIMIT) {
      logger.debug(`[summarizeContext] returning ${messages.length} messages unchanged`);
      return messages;
    }

    let cutIndex = messages.length - Agent.CONTEXT_KEEP_RECENT;

    // Ensure cutIndex is valid
    if (cutIndex <= 0) return messages;

    while (cutIndex < messages.length) {
      const firstRetained = messages[cutIndex];
      const hasOrphanToolUse =
        firstRetained.role === 'assistant' &&
        Array.isArray(firstRetained.content) &&
        firstRetained.content.some((b: { type: string }) => b.type === 'tool_use');
      const hasOrphanToolResult =
        firstRetained.role === 'user' &&
        Array.isArray(firstRetained.content) &&
        firstRetained.content.some((b: { type: string }) => b.type === 'tool_result');
      if (hasOrphanToolUse || hasOrphanToolResult) {
        cutIndex++;
        // Safety: prevent infinite loop and ensure we keep at least 1 message
        if (cutIndex >= messages.length) {
          cutIndex = messages.length - 1;
          break;
        }
      } else {
        break;
      }
    }

    // Safety: if cutIndex somehow reached the end, return original messages
    if (cutIndex >= messages.length) return messages;

    const toSummarize = messages.slice(0, cutIndex);

    // ── Enhanced semantic extraction ───────────────────────────
    // Extract 4 dimensions from the conversation history:
    // 1. Files modified (and what was done to them)
    // 2. Key actions/decisions (from both user requests AND assistant summaries)
    // 3. Tools used
    // 4. Errors encountered and fixes applied

    const fileChanges = new Map<string, string[]>();
    const decisions: string[] = [];
    const toolCounts = new Map<string, number>();
    const errors: string[] = [];
    let totalTurns = 0;

    for (const m of toSummarize) {
      totalTurns++;

      // ── From user messages: extract requests/decisions ──────────
      if (m.role === 'user' && typeof m.content === 'string' && m.content.length > 0) {
        const trimmed = m.content.replace(/\n/g, ' ').slice(0, Agent.DECISION_TRUNCATE).trim();
        // Only include non-system messages (system notices start with '[' or '#')
        if (
          trimmed.length > 0 &&
          trimmed.length < Agent.DECISION_MAX_LEN &&
          !trimmed.startsWith('[') &&
          !trimmed.startsWith('#')
        ) {
          decisions.push(trimmed);
        }
      }

      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          // ── From tool_use: track what changed ────────────────
          if (b.type === 'tool_use' && b.name) {
            toolCounts.set(b.name, (toolCounts.get(b.name) || 0) + 1);

            if ((b.name === 'Write' || b.name === 'Edit') && b.input) {
              const path = String((b.input as Record<string, unknown>)['filePath'] ?? '');
              if (path) {
                if (!fileChanges.has(path)) fileChanges.set(path, []);
                const ops = fileChanges.get(path)!;
                // Deduplicate operations per file
                if (!ops.includes(b.name)) ops.push(b.name);
              }
            }
            if (b.name === 'Bash' && b.input) {
              const cmd = String((b.input as Record<string, unknown>)['command'] ?? '');
              if (cmd.startsWith('cd ') || cmd.startsWith('mkdir ')) {
                const path = cmd.split(/\s+/)[1];
                if (path) {
                  if (!fileChanges.has(path)) fileChanges.set(path, []);
                  const ops = fileChanges.get(path)!;
                  if (!ops.includes('mkdir/cd')) ops.push('mkdir/cd');
                }
              }
            }
          }

          // ── From assistant text: extract summaries of what was done ──
          if (b.type === 'text' && typeof b.text === 'string' && b.text.length > 10) {
            // Look for sentences that describe actions/fixes
            const lines = b.text.split('\n').filter((l) => {
              const t = l.trim();
              // Skip boilerplate, markdown headers, code blocks
              if (
                !t ||
                t.startsWith('```') ||
                t.startsWith('#') ||
                t.startsWith('##') ||
                t.startsWith('_[') ||
                t.startsWith('>')
              )
                return false;
              // Look for action-indicating patterns
              return /^(Fixed|Added|Changed|Updated|Refactored|Created|Removed|Moved|Renamed|Implemented|Resolved|Optimized|Replaced|Extracted|Simplified|Rewrote)/i.test(
                t,
              );
            });
            for (const line of lines.slice(0, 3)) {
              const action = line.replace(/\n/g, ' ').trim().slice(0, Agent.DECISION_TRUNCATE);
              if (action.length > 5 && !decisions.includes(action)) {
                decisions.push(action);
              }
            }
          }

          // ── From tool results: track errors ──────────────────
          if (b.type === 'tool_result' && b.is_error && typeof b.content === 'string') {
            const errSnippet = b.content.replace(/\n/g, ' ').slice(0, 80).trim();
            if (errSnippet && !errors.includes(errSnippet)) {
              errors.push(errSnippet);
            }
          }
        }
      }
    }

    const summaryParts: string[] = ['[Prior context summary:'];
    summaryParts.push(`  ${totalTurns} conversation turns summarized`);

    if (fileChanges.size > 0) {
      const filesStr = [...fileChanges.entries()]
        .map(([path, ops]) => `${path}(${ops.join(',')})`)
        .join(', ')
        .slice(0, Agent.FILE_LIST_TRUNCATE);
      summaryParts.push(`  files: ${filesStr}`);
    }

    if (toolCounts.size > 0) {
      const toolsStr = [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, Agent.TOP_TOOLS_COUNT)
        .map(([name, count]) => `${name}(${count})`)
        .join(', ');
      summaryParts.push(`  tools: ${toolsStr}`);
    }

    // ── Key decisions from user requests (most recent first) ──
    const keyDecisions = decisions.slice(-Agent.KEY_DECISIONS_COUNT);
    if (keyDecisions.length > 0) {
      summaryParts.push('  actions:');
      for (const d of keyDecisions) summaryParts.push(`    · ${d}`);
    }

    // ── Errors encountered ──
    if (errors.length > 0) {
      summaryParts.push('  errors:');
      for (const e of errors.slice(-3)) summaryParts.push(`    ! ${e}`);
    }

    summaryParts.push(']');

    const recent = messages.slice(cutIndex);
    const result: LLMMessage[] = [];
    result.push({ role: 'user' as const, content: summaryParts.join('\n') });
    result.push(...recent);

    // Safety check: ensure we always return at least one message
    if (result.length === 0) {
      return messages; // Return original if somehow empty
    }

    return result;
  }

  /**
   * LLM-based semantic summarization for extremely large contexts.
   *
   * When the rule-based summary is too lossy, use the LLM itself to generate
   * a concise narrative summary of the oldest conversation turns. This preserves
   * the "why" and "what was learned" that rule-based extraction misses.
   *
   * Only triggered when messages exceed DOUBLE the soft limit (> 400 messages).
   * Falls back gracefully if the LLM call fails (rule-based summary already applied).
   */
  private async llmSummarizeContext(messages: LLMMessage[]): Promise<LLMMessage[]> {
    const EXTREME_LIMIT = Agent.CONTEXT_SOFT_LIMIT * 2; // 400
    if (messages.length <= EXTREME_LIMIT) return messages;

    const keepRecent = Agent.CONTEXT_KEEP_RECENT * 2; // 100 — keep more for LLM mode
    let cutIndex = messages.length - keepRecent;

    if (cutIndex <= 10) return messages;

    // Find a clean cut point (not in the middle of tool_use/tool_result pairs)
    while (cutIndex < messages.length) {
      const m = messages[cutIndex];
      const hasOrphanToolUse =
        m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use');
      const hasOrphanToolResult =
        m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result');
      if (hasOrphanToolUse || hasOrphanToolResult) {
        cutIndex++;
        if (cutIndex >= messages.length) {
          cutIndex = messages.length - 1;
          break;
        }
      } else {
        break;
      }
    }

    if (cutIndex >= messages.length) return messages;

    const toSummarize = messages.slice(0, cutIndex);
    const recent = messages.slice(cutIndex);

    // Build a compact representation of the old messages for the LLM
    const compactLines: string[] = [];
    for (const m of toSummarize) {
      if (m.role === 'user' && typeof m.content === 'string') {
        const short = m.content.replace(/\n/g, ' ').slice(0, 120).trim();
        if (short && !short.startsWith('[') && !short.startsWith('#')) {
          compactLines.push(`  U: ${short}`);
        }
      }
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'text' && typeof b.text === 'string') {
            const short = b.text.replace(/\n/g, ' ').slice(0, 120).trim();
            if (short && !short.startsWith('[') && !short.startsWith('_[')) {
              compactLines.push(`  A: ${short}`);
            }
          }
          if (b.type === 'tool_use' && b.name) {
            compactLines.push(`  Tool: ${b.name}`);
          }
          if (b.type === 'tool_result' && b.is_error && typeof b.content === 'string') {
            compactLines.push(`  Error: ${b.content.replace(/\n/g, ' ').slice(0, 100)}`);
          }
        }
      }
      // Cap the input to avoid spending too many tokens on summarization
      if (compactLines.length > 80) {
        compactLines.push('  ... (more history omitted)');
        break;
      }
    }

    if (compactLines.length < 5) return messages; // Not enough context to summarize

    const summarizePrompt = [
      'Summarize the following conversation history concisely (2-4 sentences).',
      'Focus on: what was being built/fixed, key decisions made, errors encountered.',
      'Output ONLY the summary, no preamble.',
      '',
      ...compactLines,
    ].join('\n');

    try {
      const response = await this.client.chat?.({
        model: config.model,
        maxTokens: 500,
        messages: [{ role: 'user', content: summarizePrompt }],
        stream: false,
      });
      const summary = response?.content?.trim();
      if (summary && summary.length > 20) {
        return [{ role: 'user', content: `[Prior context summarized by LLM]: ${summary}` }, ...recent];
      }
    } catch (err) {
      // LLM summarization failed - this is non-critical, fall through to rule-based
      logger.debug('[llmSummarizeContext] LLM call failed:', err);
    }

    return messages;
  }

  /** Execute Question tool (blocking) then all other tools in parallel. */
  private async executeToolBatch(
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    signal: AbortSignal,
  ): Promise<{ results: ToolResult[]; ids: string[] }> {
    const toolResults: ToolResult[] = [];
    const toolResultIds: string[] = [];
    this.cbs.onToolBatch?.(toolCalls.length);

    // Handle Question tool first (blocking)
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
        this.cbs.onQuestion?.(q, options);
        const answer = await new Promise<string>((resolve) => {
          this.questionResolve = resolve;
        });
        this.recordToolCall(tc.name, Date.now() - t0, false);
        toolResults[i] = { tool: tc.name, input: tc.input, output: answer, isError: false };
      }
    }

    // Execute non-Question tools in parallel
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
            this.cbs.onToolResult?.(tc.name, `Unknown: ${tc.name}`, true);
            return;
          }
          this.cbs.onToolStart?.(tc.name, tc.input);

          const cacheable = tc.name === 'Read' || tc.name === 'Glob';
          const cacheKey = cacheable ? this.cacheKey(tc.name, tc.input) : undefined;
          if (cacheKey) {
            const cached = this.toolCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < Agent.CACHE_TTL_MS) {
              toolResults[i] = { tool: tc.name, input: tc.input, output: cached.result, isError: false };
              return;
            }
            const pending = this.pendingReads.get(cacheKey);
            if (pending) {
              try {
                const output = await pending;
                toolResults[i] = { tool: tc.name, input: tc.input, output, isError: false };
                this.cbs.onToolResult?.(tc.name, output, false);
                return;
              } catch (err) {
                // Pending read failed - will retry with fresh execution
                if (process.env.CODEYANG_DEBUG) {
                  console.warn(`[Agent] Cached read failed for ${tc.name}, retrying:`, err);
                }
              }
            }
          }

          const t0 = Date.now();
          await this.tracer.traceAsync(this.currentTraceId, `tool.${tc.name}`, 'tool', async (span) => {
            span.tags.toolName = tc.name;
            span.tags.relatedId = JSON.stringify(tc.input).slice(0, 100);

            try {
              const executePromise = tool.execute(tc.input);
              if (cacheKey) this.pendingReads.set(cacheKey, executePromise);
              const output = await executePromise;
              this.recordToolCall(tc.name, Date.now() - t0, false);
              toolResults[i] = { tool: tc.name, input: tc.input, output, isError: false };
              this.cbs.onToolResult?.(tc.name, output, false);
              if (cacheKey) {
                this.toolCache.set(cacheKey, { result: output, timestamp: Date.now() });
                this.pendingReads.delete(cacheKey);
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
              this.cbs.onToolResult?.(tc.name, errorMsg, true);
              if (cacheKey) this.pendingReads.delete(cacheKey);
              span.status = 'error';
              span.error = errorMsg.slice(0, 200);

              // ── Reflexion: record tool execution failure ──────────
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

          // ── Reflexion: record unexpected executor errors ────────
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

  async run(prompt: string): Promise<void> {
    // ── Harness L1: Gateway — 认证/限速/审计 ──
    const gatewayRequest = this.gateway.createRequest({
      source: 'cli',
      operation: 'agent.run',
      payload: { prompt: prompt.slice(0, 200) },
      auth: { apiKey: config.apiKey },
    });
    const gatewayResponse = await this.gateway.handle(gatewayRequest);
    if (!gatewayResponse.success) {
      throw new Error(`[Gateway] ${gatewayResponse.error || 'Request rejected by gateway'}`);
    }

    // ── Tracer (L5): 创建 Trace ──
    this.currentTraceId = this.tracer.startTrace({
      name: prompt.slice(0, 60),
      source: 'cli',
      rootOperation: 'agent.run',
    });

    const traceId = this.currentTraceId;

    // Create a fresh abort controller at the start of each run().
    // Previously it was lazily created at the tool batch section (line 925),
    // which meant Ctrl+C pressed during planning or LLM streaming would be a no-op.
    this.abortController = new AbortController();
    const messages = this.jsonClone(this.history);

    const isComplex = prompt.length > 200 || (prompt.match(/[。；;.!?？]/g) || []).length >= 2 || prompt.includes('\n');
    const userMsg = isComplex
      ? `Task: ${prompt}\n\nFirst: briefly outline your approach (what you'll do step by step).\nThen: execute.`
      : prompt;

    messages.push({ role: 'user', content: userMsg });
    this.cbs.onUserMessage?.(prompt);

    setToolContext({
      anthropicClient: null,
      llmClient: this.client,
      model: config.model,
      maxTokens: config.maxTokens,
      cwd: process.cwd(),
      signal: this.abortController?.signal,
    });

    const maxTurns = config.maxTurns;

    // Apply context summarization if history exceeds soft limit
    const summarized = this.summarizeContext(messages);
    // summarizeContext returns the original array if no truncation was needed,
    // or a new shorter array if truncation occurred
    if (summarized !== messages) {
      messages.length = 0;
      messages.push(...summarized);
    }

    // LLM-based semantic summarization for extremely large contexts (> 400 messages).
    // Uses the model itself to generate a narrative summary, capturing "why" not just "what".
    if (messages.length > Agent.CONTEXT_SOFT_LIMIT * 2) {
      const llmSummarized = await this.llmSummarizeContext(messages);
      if (llmSummarized !== messages) {
        messages.length = 0;
        messages.push(...llmSummarized);
        this.cbs.onToolResult?.(
          'Context Summarizer',
          `LLM summarized ${summarized !== messages ? 'older turns' : 'conversation'} into a concise narrative`,
          false,
        );
      }
    }

    // Safety check: ensure messages is not empty before calling API
    if (messages.length === 0) {
      logger.error(`[run] messages is empty! history.length=${this.history.length}, prompt="${prompt}"`);
      throw new Error('Internal error: messages array is empty after summarization');
    }

    // ── Tree-of-Thoughts: parallel exploration for highly complex tasks ──
    // Triggered before the planner for tasks that need multi-path exploration.
    if (this.treeOfThoughts.shouldUseToT(prompt)) {
      this.cbs.onAgentDelta?.('\n\n_[🌳 Tree-of-Thoughts: exploring alternative approaches...]_');
      const totResult = await this.treeOfThoughts.explore(this.client, config.model, config.maxTokens, prompt);
      if (totResult.selected && totResult.selected.steps.length > 0) {
        messages.push({ role: 'user', content: totResult.summary });
        this.cbs.onToolResult?.(
          'Tree-of-Thoughts',
          `${totResult.explored.length} paths explored, selected: ${totResult.selected.approach} (${totResult.selected.evaluation.score}/100)`,
          false,
        );
      }
    }

    // ── Planner: auto-detect complex tasks and generate plan ──
    if (config.planner.enabled && this.planner.shouldPlan(prompt)) {
      this.cbs.onAgentDelta?.('\n\n_[Planning: breaking down complex task...]_');
      const plan = await this.planner.generatePlan(this.client, config.model, config.maxTokens, prompt);
      if (plan && plan.steps.length > 0) {
        const planNotice = [
          '## Generated Plan',
          '',
          `Task: **${plan.task}**`,
          `Total steps: ${plan.steps.length}`,
          '',
          ...plan.steps.map((s, i) => {
            const deps = s.dependencies.length > 0 ? ` (depends on: ${s.dependencies.join(', ')})` : '';
            return `**Step ${i + 1}:** ${s.description}${deps}`;
          }),
          '',
          'Execute this plan step by step. Complete each step before moving to the next.',
        ].join('\n');

        messages.push({ role: 'user', content: planNotice });
        this.cbs.onToolResult?.('Planner', `${plan.steps.length} steps generated`, false);
        // Activate the plan so step tracking begins
        this.planner.activatePlan(plan.id);
      }
    }

    // Track the current active plan for step-by-step progress
    let currentPlanId = this.planner.getLatestActivePlanId();

    for (let turn = 0; turn < maxTurns; turn++) {
      logger.debug(`[turn ${turn}] messages count: ${messages.length}`);

      // Double-check before API call
      if (messages.length === 0) {
        throw new Error('[Agent] Internal error: messages array became empty at turn ' + turn);
      }

      // 上下文窗口保护：估算消息 token 数，超过 90% 最大值时截断
      const estimatedTokens = this.estimateMessageTokens(messages);
      const maxCtxTokens = config.maxTokens * 2; // 粗略估计上下�?= maxTokens * 2
      if (estimatedTokens > maxCtxTokens * 0.9) {
        this.cbs.onError?.(
          `⚠️ Context approaching limit (~${Math.round(estimatedTokens / 1000)}k tokens). Truncating history.`,
        );
        // 保留最近一半消息
        const keepCount = Math.max(10, Math.floor(messages.length / 2));
        if (messages.length > keepCount) messages.splice(0, messages.length - keepCount);
      }

      const systemPrompt = await this.getSystemPrompt();

      // ── CircuitBreaker (L6): 保护 LLM 调用 + Tracer (L5): 追踪 LLM 流 ──
      const streamResult = await this.tracer.traceAsync(traceId, 'llm.stream', 'llm', async (span) => {
        span.tags.model = config.model;
        span.tags.maxTokens = config.maxTokens;

        const cbResult = await this.circuitBreakerManager.get('llm-api').call(async () => {
          return await this.withRetry(async () => {
            const textParts: string[] = [];
            const toolCallsInner: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            const toolCallsAccum: Map<number, { id?: string; name?: string; args: string }> = new Map();

            // ── Stream consumption with timeout protection ─────────
            const consumeStream = async () => {
              for await (const event of this.client.stream({
                model: config.model,
                maxTokens: config.maxTokens,
                temperature: 0.5,
                system: systemPrompt,
                messages,
                tools: toolSchemas(),
              })) {
                if (event.type === 'text_delta' && event.text) {
                  this.cbs.onAgentDelta?.(event.text);
                  textParts.push(event.text);
                } else if (event.type === 'tool_call_start') {
                  toolCallsAccum.set(event.toolCallIndex!, {
                    id: event.toolCallId,
                    name: event.toolCallName,
                    args: '',
                  });
                } else if (event.type === 'tool_call_delta') {
                  const accum = toolCallsAccum.get(event.toolCallIndex!);
                  if (accum) accum.args += event.toolCallArgs || '';
                } else if (event.type === 'tool_call_end') {
                  const accum = toolCallsAccum.get(event.toolCallIndex!);
                  if (accum) {
                    try {
                      toolCallsInner.push({
                        id: accum.id!,
                        name: accum.name!,
                        input: JSON.parse(accum.args || '{}'),
                      });
                    } catch (err) {
                      // JSON parse failed - use empty input as fallback
                      toolCallsInner.push({ id: accum.id!, name: accum.name!, input: {} });
                      if (process.env.CODEYANG_DEBUG) {
                        console.warn('[Agent] Failed to parse tool args:', err);
                      }
                    }
                  }
                } else if (event.type === 'usage') {
                  if (event.inputTokens !== undefined) this.tokenUsage.inputTokens += event.inputTokens;
                  if (event.outputTokens !== undefined) this.tokenUsage.outputTokens += event.outputTokens;
                }
              }
              return { toolCalls: toolCallsInner, assistantText: textParts.join('') };
            };

            // Race between stream completion and timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Stream timed out after ${Agent.STREAM_TIMEOUT_MS / 1000}s. ` +
                        `The model may be stuck or the connection was interrupted.`,
                    ),
                  ),
                Agent.STREAM_TIMEOUT_MS,
              );
            });

            return Promise.race([consumeStream(), timeoutPromise]);
          }, 'LLM streaming API call');
        });

        if (!cbResult.success) {
          throw new Error(`LLM API circuit breaker: ${cbResult.error}`);
        }
        return cbResult.data!;
      });

      const { toolCalls, assistantText } = streamResult as {
        toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
        assistantText: string;
      };
      const assistantContent: AssistantContentBlock[] = [];

      if (assistantText) assistantContent.push({ type: 'text', text: assistantText });
      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      messages.push({ role: 'assistant', content: assistantContent });

      // Anti-repetition check
      if (assistantText) {
        if (assistantText === this.lastAssistantText) {
          this.repeatCount++;
          if (this.repeatCount >= 2) {
            this.cbs.onError?.('Agent loop detected (exact repeat) �?stopping');
            if (toolCalls.length > 0) {
              messages.push({
                role: 'user',
                content: toolCalls.map((tc) => ({
                  type: 'tool_result' as const,
                  tool_use_id: tc.id,
                  content: '[Cancelled by anti-repetition guard]',
                  is_error: true,
                })),
              });
            }
            this.history.length = 0;
            this.history.push(...messages);
            break;
          }
        } else if (
          this.computeSimilarity(assistantText) > 0 &&
          this.recentAssistantTexts.length >= Agent.MIN_REPEAT_TEXTS_FOR_FUZZY
        ) {
          this.cbs.onError?.('Agent loop detected (similar repeat) �?stopping');
          if (toolCalls.length > 0) {
            messages.push({
              role: 'user',
              content: toolCalls.map((tc) => ({
                type: 'tool_result' as const,
                tool_use_id: tc.id,
                content: '[Cancelled by anti-repetition guard]',
                is_error: true,
              })),
            });
          }
          this.history.length = 0;
          this.history.push(...messages);
          break;
        } else {
          this.repeatCount = 0;
        }
        this.lastAssistantText = assistantText;
        this.recentAssistantTexts.push(assistantText);
        if (this.recentAssistantTexts.length > Agent.MAX_RECENT_TEXTS) {
          this.recentAssistantTexts.shift();
        }
      }

      if (toolCalls.length === 0) {
        this.history.length = 0;
        this.history.push(...messages);
        break;
      }

      this.abortController = this.abortController ?? new AbortController();
      // Execute tools
      const signal = this.abortController.signal;
      setToolContext({
        anthropicClient: null,
        llmClient: this.client,
        model: config.model,
        maxTokens: config.maxTokens,
        cwd: process.cwd(),
        signal,
      });

      const { results: toolResults, ids: toolResultIds } = await this.executeToolBatch(toolCalls, signal);
      this.abortController = null;

      const toolResultContent: ToolResultBlock[] = toolResults.map((tr, i) => ({
        type: 'tool_result',
        tool_use_id: toolResultIds[i] ?? 'unknown',
        content: tr.output,
        is_error: tr.isError,
      }));

      messages.push({ role: 'user', content: toolResultContent });

      // ── Closed-loop: auto-verify after Write/Edit ─────────────
      if (config.autoVerify && this.verificationPipeline) {
        const writtenFiles = toolCalls
          .filter(
            (tc) =>
              (tc.name === 'Write' || tc.name === 'Edit') && tc.input && (tc.input as Record<string, unknown>).filePath,
          )
          .map((tc) => String((tc.input as Record<string, unknown>).filePath));

        if (writtenFiles.length > 0) {
          const allResults: VerificationResult[] = [];
          await Promise.all(
            writtenFiles.map(async (fp) => {
              if (config.autoFixOnError) {
                const { results } = await this.verificationPipeline!.verifyWithFix(fp);
                allResults.push(...results);
              } else {
                const results = await this.verificationPipeline!.run(fp);
                allResults.push(...results);
              }
            }),
          );

          const failed = allResults.filter((r) => !r.passed);
          const summary = this.verificationPipeline.formatSummary(allResults);

          // Always push feedback into the injector for other consumers
          this.feedbackInjector.push({
            summary,
            source: 'auto-verify',
            passed: failed.length === 0,
            results: allResults,
          });

          if (failed.length > 0) {
            const injectMsg = FeedbackInjector.formatAutoVerify(summary);
            // Inject as a plain user message so the LLM can act on the errors
            messages.push({ role: 'user', content: injectMsg });
            this.cbs.onToolResult?.('Auto-Verify', summary, true);
          } else {
            this.cbs.onToolResult?.('Auto-Verify', allResults.map((r) => r.tool).join(', ') + ' passed', false);
          }
        }
      }

      // ── Closed-loop: check post-tool triggers ─────────────────
      if (this.watcher) {
        for (const tc of toolCalls) {
          this.watcher.checkPostTool({
            filePath: String((tc.input as Record<string, unknown>)?.filePath ?? ''),
            toolName: tc.name,
            toolInput: tc.input as Record<string, unknown>,
          });
        }
      }

      // ── Reflexion: auto-trigger after repeated failures ──────
      if (config.reflexion.enabled && this.reflexionEngine.shouldReflect()) {
        this.cbs.onAgentDelta?.('\n\n_[Self-reflection triggered: analyzing recent failures...]_');
        const reflection = await this.reflexionEngine.reflect(this.client, config.model, config.maxTokens);
        if (reflection) {
          // Inject reflection result into next turn's context
          const injectMsg = [
            '## Self-Reflection Notice',
            '',
            'The system detected a pattern of repeated failures and performed self-reflection.',
            '',
            `**Analysis:** ${reflection.analysis}`,
            '',
            reflection.patterns.length > 0
              ? `**Identified patterns:**\n${reflection.patterns.map((p: string) => `- ${p}`).join('\n')}`
              : '',
            '',
            reflection.recommendations.length > 0
              ? `**Recommendations:**\n${reflection.recommendations.map((r: string) => `- ${r}`).join('\n')}`
              : '',
            '',
            'Please apply these learnings to avoid repeating the same mistakes.',
          ]
            .filter(Boolean)
            .join('\n');

          messages.push({ role: 'user', content: injectMsg });
          this.cbs.onToolResult?.('Reflexion', reflection.analysis, false);
        }
      }

      // ── Planner: step advancement ─────────────────────────
      // After each turn's tool execution, advance the active plan step.
      // This provides both internal tracking and feedback to the agent.
      if (currentPlanId) {
        const progress = this.planner.advanceStep(currentPlanId);
        if (progress) {
          this.cbs.onToolResult?.('Planner', progress, false);
          // If plan is complete, clear the tracker
          if (progress.includes('✅')) {
            currentPlanId = null;
          } else {
            // Inject a gentle progress reminder so the agent knows where it is
            // Only inject every 2 turns to avoid cluttering the conversation
            if (turn % 2 === 1) {
              messages.push({ role: 'user', content: progress });
            }
          }
        }
      }

      // ── Self-Critique: review output quality ──────────────────
      await this.runSelfCritique(assistantText, toolCalls, toolResults, messages);

      // ── Continual Learning: periodic memory consolidation ────
      this.consolidationCounter++;
      if (this.consolidationCounter >= 10) {
        this.consolidationCounter = 0;
        // Fire-and-forget: consolidation runs in background
        runConsolidation()
          .then((report) => {
            if (report.consolidated > 0) {
              logger.debug(
                `[ContinualLearning] Consolidated ${report.consolidated} memories (classified: ${report.classified}, compressed: ${report.compressed}, forgotten: ${report.forgotten})`,
              );
            }
          })
          .catch(() => {});
      }

      this.history.length = 0;
      this.history.push(...messages);
    }

    setToolContext(null);

    // ── Tracer (L5): 结束 Trace ──
    if (this.currentTraceId) {
      this.tracer.endTrace(this.currentTraceId);
      this.currentTraceId = '';
    }
  }

  /** Record a tool call for usage statistics and RL weighting. */
  recordToolCall(name: string, ms: number, isError: boolean): void {
    const s = this.toolStats.get(name) || { calls: 0, totalMs: 0, errors: 0 };
    s.calls++;
    s.totalMs += ms;
    if (isError) s.errors++;
    this.toolStats.set(name, s);

    // ── Tool-Augmented RL: record outcome for adaptive weighting ──
    recordToolOutcome(name, !isError, ms, isError ? `Error in ${name}` : undefined).catch(() => {});
  }

  /** Get per-tool usage statistics. */
  getToolStats(): ReadonlyMap<string, { calls: number; totalMs: number; errors: number }> {
    return this.toolStats;
  }

  /** Restore history from saved messages including tool_result blocks */
  loadMessages(msgs: Message[]) {
    // Reset anti-repetition state when loading a new session
    this.lastAssistantText = '';
    this.recentAssistantTexts = [];
    this.repeatCount = 0;

    for (const m of msgs) {
      if (m.role === 'user') {
        if (m.toolResults && m.toolResults.length > 0) {
          // Reconstruct tool_result blocks for session resumption
          const blocks: ToolResultBlock[] = m.toolResults.map((tr) => ({
            type: 'tool_result',
            tool_use_id: tr.tool || 'unknown',
            content: tr.output,
            is_error: tr.isError,
          }));
          this.history.push({ role: 'user', content: blocks });
        } else {
          this.history.push({ role: 'user', content: m.content });
        }
      } else if (m.role === 'assistant') {
        const blocks: AssistantContentBlock[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
          }
        }
        this.history.push({ role: 'assistant', content: blocks });
      }
    }
  }

  /** Serialize history preserving tool_result blocks for session persistence */
  exportMessages(): Message[] {
    return this.history.map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: m.content };
      }

      const blocks = m.content as (AssistantContentBlock | ToolResultBlock)[];

      // Extract text parts
      const textParts = blocks
        .filter((b): b is AssistantContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Extract tool_use parts
      const toolUseParts = blocks
        .filter((b): b is AssistantContentBlock & { type: 'tool_use' } => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          name: b.name,
          args: b.input as Record<string, unknown>,
        }));

      // Extract tool_result parts �?critical for session resumption
      const toolResultParts = blocks
        .filter((b): b is ToolResultBlock => b.type === 'tool_result')
        .map((b) => ({
          tool: b.tool_use_id,
          input: {} as Record<string, unknown>,
          output: b.content,
          isError: b.is_error === true,
        }));

      return {
        role: m.role,
        content: textParts,
        toolCalls: toolUseParts.length > 0 ? (toolUseParts as ToolCall[]) : undefined,
        toolResults: toolResultParts.length > 0 ? (toolResultParts as ToolResult[]) : undefined,
      };
    });
  }
}
