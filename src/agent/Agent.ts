/**
 * Agent — the core AI agent loop.
 *
 * Responsibilities:
 * - User-facing API (run, reset, sessions, checkpoints)
 * - Main run loop (LLM streaming, tool execution orchestration)
 * - Harness components (Gateway, Tracer, CircuitBreaker)
 * - Planners & thinkers (Planner, TreeOfThoughts, Reflexion, SelfCritique)
 * - Closed-loop (auto-verify, watcher)
 *
 * Delegates to:
 * - AgentContextManager → system prompt, memory, context summarization
 * - AgentToolExecutor → tool caching, batch execution, RL recording
 * - AgentUtils → pure helper functions
 */
import type { Message, ToolCall, ToolResult } from '../types.js';
import { config } from './config.js';
import { toolSchemas, setToolContext } from '../tools/registry.js';
import type { QtContext } from '../qt/index.js';
import { createLLMClient, type LLMClient, type LLMMessage } from './LLMClient.js';
import { logger } from '../utils/logger.js';
import { VerificationPipeline, type VerificationResult } from '../closed-loop/VerificationPipeline.js';
import { FeedbackInjector } from '../closed-loop/FeedbackInjector.js';
import type { WatcherSystem } from '../closed-loop/WatcherSystem.js';
import { ReflexionEngine } from '../reflexion/ReflexionEngine.js';
import { CritiqueEngine } from '../reflexion/CritiqueEngine.js';
import { Planner } from '../planner/Planner.js';
import { TreeOfThoughts } from '../tot/TreeOfThoughts.js';
import { runConsolidation } from '../continual-learning/MemoryManager.js';
import { A2AProtocol, globalAgentRegistry } from '../a2a/A2AProtocol.js';
import { Tracer } from '../tracing/index.js';
import { CircuitBreakerManager, type CircuitBreakerStats } from '../circuit-breaker/index.js';
import { Gateway } from '../gateway/index.js';
import { getAllToolWeights } from '../tools/rl-weighter.js';
import { AgentContextManager } from './AgentContextManager.js';
import { AgentToolExecutor } from './AgentToolExecutor.js';
import { jsonClone, withRetry, checkExactRepeat, checkFuzzyRepeat } from './AgentUtils.js';

// ── Constants ──────────────────────────────────────────────

const STREAM_TIMEOUT_MS = 120_000; // 2 min
const SIMILARITY_PREFIX_LEN = 100;
const MAX_RECENT_TEXTS = 4;
const MIN_REPEAT_TEXTS_FOR_FUZZY = 2;
const MAX_CHECKPOINTS = 10;

type AssistantContentBlock =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

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
  // ── Instance state ───────────────────────────────────────
  private client: LLMClient;
  private history: LLMMessage[] = [];
  private cbs: AgentCallbacks = {};
  private checkpoints: LLMMessage[][] = [];
  private questionResolve: ((answer: string) => void) | null = null;
  private maxRetries: number;

  // Anti-repetition
  private lastAssistantText = '';
  private recentAssistantTexts: string[] = [];
  private repeatCount = 0;

  // Streaming timeout
  private abortController: AbortController | null = null;

  // Token usage tracking
  private tokenUsage = { inputTokens: 0, outputTokens: 0 };

  // Delegated helpers
  private ctxManager: AgentContextManager;
  private toolExecutor: AgentToolExecutor;

  // Closed-loop
  private verificationPipeline: VerificationPipeline | null = null;
  private feedbackInjector = new FeedbackInjector();
  private watcher: WatcherSystem | null = null;

  // Reflexion & Critique
  private reflexionEngine: ReflexionEngine;
  private critiqueEngine: CritiqueEngine;

  // Planner & Tree-of-Thoughts
  private planner: Planner;
  private treeOfThoughts: TreeOfThoughts;

  // A2A
  private a2aProtocol: A2AProtocol;

  // Continual Learning
  private consolidationCounter = 0;

  // Harness
  private tracer: Tracer;
  private currentTraceId = '';
  private circuitBreakerManager: CircuitBreakerManager;
  private gateway: Gateway;

  constructor(private qtContext?: QtContext) {
    this.client = createLLMClient(config.provider, config.apiKey, config.baseURL);
    this.reflexionEngine = new ReflexionEngine(config.reflexion);
    this.critiqueEngine = new CritiqueEngine();
    this.planner = new Planner(config.planner);
    this.treeOfThoughts = new TreeOfThoughts();
    this.a2aProtocol = new A2AProtocol({}, globalAgentRegistry);
    this.maxRetries = config.maxRetries ?? 3;

    this.ctxManager = new AgentContextManager((max) => this.reflexionEngine.getLearnedPatterns(max));
    this.toolExecutor = new AgentToolExecutor(this.reflexionEngine);

    // Harness
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
    this.circuitBreakerManager.create('llm-api', {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      slowCallThresholdMs: 30_000,
    });
    this.circuitBreakerManager.create('tool-execute', {
      failureThreshold: 10,
      resetTimeoutMs: 15_000,
      slowCallThresholdMs: 60_000,
    });
    this.gateway = Gateway.getInstance();

    globalAgentRegistry.register(this.a2aProtocol.getMyCard());
    this.a2aProtocol.setLLMClient(this.client, config.model, config.maxTokens);
  }

  // ── Public API ───────────────────────────────────────────

  setWatcher(watcher: WatcherSystem | null): void {
    this.watcher = watcher;
  }
  setVerificationPipeline(pipeline: VerificationPipeline | null): void {
    this.verificationPipeline = pipeline;
  }

  get pendingFeedback(): boolean {
    return this.feedbackInjector.hasPending();
  }

  getLLMClient(): LLMClient {
    return this.client;
  }
  getReflexionEngine(): ReflexionEngine {
    return this.reflexionEngine;
  }
  getPlanner(): Planner {
    return this.planner;
  }

  // Harness accessors
  getTracer(): Tracer {
    return this.tracer;
  }
  getCircuitBreakerManager(): CircuitBreakerManager {
    return this.circuitBreakerManager;
  }
  getGateway(): Gateway {
    return this.gateway;
  }
  getCurrentTraceId(): string {
    return this.currentTraceId;
  }

  getHarnessStatus(): Record<string, unknown> {
    const cbStats = this.circuitBreakerManager.getAllStats();
    const traces = this.tracer.getTraces(5);
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
      if (process.env.CODEYANG_DEBUG) console.warn('[Agent] Failed to collect audit stats:', err);
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
      gateway: { operations: auditOps, totalRequests: auditReqs },
    };
  }

  getClosedLoopStatus(): Record<string, unknown> {
    const reflexionStats = this.reflexionEngine.getStats();
    const recentExecs = this.reflexionEngine.getRecentExecutions(3);
    const consecutiveFails =
      recentExecs.length >= 2 && recentExecs.every((r) => !r.success)
        ? recentExecs.filter((r) => !r.success).length
        : 0;

    const toolWeights = getAllToolWeights()
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
        totalReflections: 0,
        recentErrors: reflexionStats.failed,
      },
      planner: {
        enabled: config.planner.enabled,
        activePlans: this.planner.getActivePlans().length,
        totalPlans: this.planner.getAllPlans().length,
      },
      rlWeights: {
        enabled: true,
        topPerformingTools: toolWeights,
        totalToolCalls: getAllToolWeights().reduce((sum: number, t: { calls: number }) => sum + t.calls, 0),
      },
    };
  }

  setCallbacks(cbs: AgentCallbacks) {
    this.cbs = cbs;
  }
  get apiKeySet(): boolean {
    return config.apiKey.length > 0;
  }
  getTokenUsage(): { inputTokens: number; outputTokens: number } {
    return { ...this.tokenUsage };
  }

  saveCheckpoint(): number {
    const idx = this.checkpoints.length;
    this.checkpoints.push(jsonClone(this.history));
    if (this.checkpoints.length > MAX_CHECKPOINTS) this.checkpoints.shift();
    return idx;
  }

  restoreCheckpoint(): boolean {
    if (this.checkpoints.length === 0) return false;
    this.history = this.checkpoints.pop()!;
    return true;
  }

  get checkpointCount(): number {
    return this.checkpoints.length;
  }

  reset() {
    this.history = [];
    this.toolExecutor.invalidateCache();
    this.lastAssistantText = '';
    this.recentAssistantTexts = [];
    this.repeatCount = 0;
    this.tokenUsage = { inputTokens: 0, outputTokens: 0 };
    this.toolExecutor = new AgentToolExecutor(this.reflexionEngine);
    this.ctxManager.invalidateCache();
  }

  answerQuestion(answer: string) {
    if (this.questionResolve) {
      this.questionResolve(answer);
      this.questionResolve = null;
    }
  }

  cancelQuestion() {
    if (this.questionResolve) {
      this.questionResolve('[Cancelled by user]');
      this.questionResolve = null;
    }
  }

  cancelRunningTools() {
    if (this.abortController) this.abortController.abort();
  }

  get waitingForAnswer(): boolean {
    return this.questionResolve !== null;
  }

  // ── Tool stats (delegate) ────────────────────────────────

  recordToolCall(name: string, ms: number, isError: boolean): void {
    this.toolExecutor.recordToolCall(name, ms, isError);
  }

  getToolStats(): ReadonlyMap<string, { calls: number; totalMs: number; errors: number }> {
    return this.toolExecutor.getToolStats();
  }

  // ── Main run loop ────────────────────────────────────────

  async run(prompt: string): Promise<void> {
    // Gateway (L1)
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

    // Tracer (L5)
    this.currentTraceId = this.tracer.startTrace({
      name: prompt.slice(0, 60),
      source: 'cli',
      rootOperation: 'agent.run',
    });
    const traceId = this.currentTraceId;

    this.abortController = new AbortController();
    const messages = jsonClone(this.history);

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

    // Context summarization (rule-based)
    const summarized = this.ctxManager.summarizeContext(messages);
    if (summarized !== messages) {
      messages.length = 0;
      messages.push(...summarized);
    }

    // LLM-based summarization for extremely large contexts
    if (messages.length > 200 * 2) {
      const llmSummarized = await this.ctxManager.llmSummarizeContext(
        messages,
        this.client,
        config.model,
        config.maxTokens,
      );
      if (llmSummarized !== messages) {
        messages.length = 0;
        messages.push(...llmSummarized);
        this.cbs.onToolResult?.('Context Summarizer', 'LLM summarized older turns into a concise narrative', false);
      }
    }

    if (messages.length === 0) {
      logger.error(`[run] messages is empty! history.length=${this.history.length}, prompt="${prompt}"`);
      throw new Error('Internal error: messages array is empty after summarization');
    }

    // Tree-of-Thoughts
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

    // Planner
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
        this.planner.activatePlan(plan.id);
      }
    }

    let currentPlanId = this.planner.getLatestActivePlanId();

    // ── Main turn loop ──
    const maxTurns = config.maxTurns;

    for (let turn = 0; turn < maxTurns; turn++) {
      logger.debug(`[turn ${turn}] messages count: ${messages.length}`);
      if (messages.length === 0) throw new Error('[Agent] Internal error: messages empty at turn ' + turn);

      // Context window protection
      this.ctxManager.truncateIfNeeded(messages, config.maxTokens);

      const systemPrompt = await this.ctxManager.getSystemPrompt(this.qtContext);

      // LLM call with CircuitBreaker (L6) + Tracer (L5)
      const streamResult = await this.tracer.traceAsync(traceId, 'llm.stream', 'llm', async (span) => {
        span.tags.model = config.model;
        span.tags.maxTokens = config.maxTokens;

        const cbResult = await this.circuitBreakerManager.get('llm-api').call(async () => {
          return await withRetry(
            async () => {
              const textParts: string[] = [];
              const toolCallsInner: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
              const toolCallsAccum: Map<number, { id?: string; name?: string; args: string }> = new Map();

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
                        toolCallsInner.push({ id: accum.id!, name: accum.name!, input: {} });
                        if (process.env.CODEYANG_DEBUG) console.warn('[Agent] Failed to parse tool args:', err);
                      }
                    }
                  } else if (event.type === 'usage') {
                    if (event.inputTokens !== undefined) this.tokenUsage.inputTokens += event.inputTokens;
                    if (event.outputTokens !== undefined) this.tokenUsage.outputTokens += event.outputTokens;
                  }
                }
                return { toolCalls: toolCallsInner, assistantText: textParts.join('') };
              };

              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Stream timed out after ${STREAM_TIMEOUT_MS / 1000}s. The model may be stuck or the connection was interrupted.`,
                      ),
                    ),
                  STREAM_TIMEOUT_MS,
                );
              });

              return Promise.race([consumeStream(), timeoutPromise]);
            },
            'LLM streaming API call',
            this.maxRetries,
            (err) => this.cbs.onError?.(err),
          );
        });

        if (!cbResult.success) throw new Error(`LLM API circuit breaker: ${cbResult.error}`);
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

      // Anti-repetition
      if (assistantText) {
        const exactCheck = checkExactRepeat(assistantText, this.lastAssistantText, this.repeatCount, 2);
        this.repeatCount = exactCheck.newRepeatCount;

        if (exactCheck.isRepeat) {
          this.cbs.onError?.('Agent loop detected (exact repeat) — stopping');
          this.pushCancelledToolResults(messages, toolCalls);
          this.history.length = 0;
          this.history.push(...messages);
          break;
        }

        if (
          checkFuzzyRepeat(assistantText, this.recentAssistantTexts, MIN_REPEAT_TEXTS_FOR_FUZZY, SIMILARITY_PREFIX_LEN)
        ) {
          this.cbs.onError?.('Agent loop detected (similar repeat) — stopping');
          this.pushCancelledToolResults(messages, toolCalls);
          this.history.length = 0;
          this.history.push(...messages);
          break;
        }

        this.lastAssistantText = assistantText;
        this.recentAssistantTexts.push(assistantText);
        if (this.recentAssistantTexts.length > MAX_RECENT_TEXTS) this.recentAssistantTexts.shift();
      }

      if (toolCalls.length === 0) {
        this.history.length = 0;
        this.history.push(...messages);
        break;
      }

      // Execute tools
      this.abortController = this.abortController ?? new AbortController();
      const signal = this.abortController.signal;
      setToolContext({
        anthropicClient: null,
        llmClient: this.client,
        model: config.model,
        maxTokens: config.maxTokens,
        cwd: process.cwd(),
        signal,
      });

      const { results: toolResults, ids: toolResultIds } = await this.toolExecutor.executeToolBatch(
        toolCalls,
        signal,
        this.cbs,
        traceId,
        this.tracer,
        (resolve) => {
          this.questionResolve = resolve;
        },
      );
      this.abortController = null;

      const toolResultContent: ToolResultBlock[] = toolResults.map((tr, i) => ({
        type: 'tool_result',
        tool_use_id: toolResultIds[i] ?? 'unknown',
        content: tr.output,
        is_error: tr.isError,
      }));
      messages.push({ role: 'user', content: toolResultContent });

      // Closed-loop: auto-verify
      await this.runAutoVerify(toolCalls, messages);

      // Watcher: post-tool triggers
      if (this.watcher) {
        for (const tc of toolCalls) {
          this.watcher.checkPostTool({
            filePath: String((tc.input as Record<string, unknown>)?.filePath ?? ''),
            toolName: tc.name,
            toolInput: tc.input as Record<string, unknown>,
          });
        }
      }

      // Reflexion
      if (config.reflexion.enabled && this.reflexionEngine.shouldReflect()) {
        await this.runReflexion(messages);
      }

      // Planner step advancement
      if (currentPlanId) {
        const progress = this.planner.advanceStep(currentPlanId);
        if (progress) {
          this.cbs.onToolResult?.('Planner', progress, false);
          if (progress.includes('✅')) {
            currentPlanId = null;
          } else if (turn % 2 === 1) {
            messages.push({ role: 'user', content: progress });
          }
        }
      }

      // Self-Critique
      await this.runSelfCritique(assistantText, toolCalls, toolResults, messages);

      // Continual Learning
      this.consolidationCounter++;
      if (this.consolidationCounter >= 10) {
        this.consolidationCounter = 0;
        runConsolidation()
          .then((report) => {
            if (report.consolidated > 0) {
              logger.debug(`[ContinualLearning] Consolidated ${report.consolidated} memories`);
            }
          })
          .catch((err) =>
            logger.warn('[ContinualLearning] Consolidation failed:', err instanceof Error ? err.message : err),
          );
      }

      this.history.length = 0;
      this.history.push(...messages);
    }

    setToolContext(null);

    if (this.currentTraceId) {
      this.tracer.endTrace(this.currentTraceId);
      this.currentTraceId = '';
    }
  }

  // ── Private helpers ──────────────────────────────────────

  private pushCancelledToolResults(
    messages: LLMMessage[],
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  ): void {
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
  }

  private async runAutoVerify(
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    messages: LLMMessage[],
  ): Promise<void> {
    if (!config.autoVerify || !this.verificationPipeline) return;

    const writtenFiles = toolCalls
      .filter(
        (tc) =>
          (tc.name === 'Write' || tc.name === 'Edit') && tc.input && (tc.input as Record<string, unknown>).filePath,
      )
      .map((tc) => String((tc.input as Record<string, unknown>).filePath));

    if (writtenFiles.length === 0) return;

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

    this.feedbackInjector.push({ summary, source: 'auto-verify', passed: failed.length === 0, results: allResults });

    if (failed.length > 0) {
      const injectMsg = FeedbackInjector.formatAutoVerify(summary);
      messages.push({ role: 'user', content: injectMsg });
      this.cbs.onToolResult?.('Auto-Verify', summary, true);
    } else {
      this.cbs.onToolResult?.('Auto-Verify', allResults.map((r) => r.tool).join(', ') + ' passed', false);
    }
  }

  private async runReflexion(messages: LLMMessage[]): Promise<void> {
    this.cbs.onAgentDelta?.('\n\n_[Self-reflection triggered: analyzing recent failures...]_');
    const reflection = await this.reflexionEngine.reflect(this.client, config.model, config.maxTokens);
    if (reflection) {
      const injectMsg = [
        '## Self-Reflection Notice',
        '',
        'The system detected a pattern of repeated failures and performed self-reflection.',
        '',
        `**Analysis:** ${reflection.analysis}`,
        '',
        ...(reflection.patterns.length > 0
          ? [`**Identified patterns:**\n${reflection.patterns.map((p: string) => `- ${p}`).join('\n')}`]
          : []),
        '',
        ...(reflection.recommendations.length > 0
          ? [`**Recommendations:**\n${reflection.recommendations.map((r: string) => `- ${r}`).join('\n')}`]
          : []),
        '',
        'Please apply these learnings to avoid repeating the same mistakes.',
      ]
        .filter(Boolean)
        .join('\n');
      messages.push({ role: 'user', content: injectMsg });
      this.cbs.onToolResult?.('Reflexion', reflection.analysis, false);
    }
  }

  private async runSelfCritique(
    assistantText: string,
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    toolResults: ToolResult[],
    messages: LLMMessage[],
  ): Promise<void> {
    if (!assistantText || this.critiqueEngine.getIterationCount()) return;

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

  // ── Session serialization ────────────────────────────────

  /** Restore history from saved messages including tool_result blocks. */
  loadMessages(msgs: Message[]) {
    this.lastAssistantText = '';
    this.recentAssistantTexts = [];
    this.repeatCount = 0;

    for (const m of msgs) {
      if (m.role === 'user') {
        if (m.toolResults && m.toolResults.length > 0) {
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

  /** Serialize history preserving tool_result blocks for session persistence. */
  exportMessages(): Message[] {
    return this.history.map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: m.content };
      }

      const blocks = m.content as (AssistantContentBlock | ToolResultBlock)[];

      const textParts = blocks
        .filter((b): b is AssistantContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const toolUseParts = blocks
        .filter((b): b is AssistantContentBlock & { type: 'tool_use' } => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, args: b.input as Record<string, unknown> }));

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
