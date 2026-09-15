/**
 * Agent — the core AI agent loop.
 *
 * Responsibilities:
 * - User-facing API (run, reset, sessions, checkpoints)
 * - Harness components (Gateway, Tracer, CircuitBreaker)
 * - Closed-loop (auto-verify, watcher)
 *
 * Delegates to:
 * - AgentContextManager → system prompt, memory, context summarization
 * - AgentToolExecutor → tool caching, batch execution, RL recording
 * - StateManager → repetition tracking, token usage, question state
 * - ConversationManager → message history
 * - core/run-loop.ts → main orchestration loop
 * - core/streaming.ts → LLM streaming with timeout protection
 * - core/tool-execution.ts → tool batch execution and repetition checks
 * - core/verification.ts → auto-verify, reflexion, self-critique
 * - core/context.ts → context preparation and planning enrichment
 */
import type { Message, ToolCall, ToolResult } from '../types.js';
import { config } from './config.js';
import type { QtContext } from '../experimental/qt/index.js';
import { createLLMClient, type LLMClient } from './LLMClient.js';
import { VerificationPipeline } from '../closed-loop/VerificationPipeline.js';
import { FeedbackInjector } from '../closed-loop/FeedbackInjector.js';
import type { WatcherSystem } from '../closed-loop/WatcherSystem.js';
import { ReflexionEngine } from '../experimental/reflexion/ReflexionEngine.js';
import { CritiqueEngine } from '../experimental/reflexion/CritiqueEngine.js';
import { Planner } from '../planner/Planner.js';
import { TreeOfThoughts } from '../tot/TreeOfThoughts.js';
import { A2AProtocol, globalAgentRegistry } from '../a2a/A2AProtocol.js';
import { Tracer } from '../tracing/index.js';
import { CircuitBreakerManager } from '../circuit-breaker/index.js';
import { Gateway } from '../gateway/index.js';
import { getAllToolWeights } from '../tools/rl-weighter.js';
import { AgentContextManager } from './AgentContextManager.js';
import { AgentToolExecutor } from './AgentToolExecutor.js';
import { StateManager } from './managers/StateManager.js';
import { ConversationManager } from './managers/ConversationManager.js';
import { runLoop } from './core/run-loop.js';
import type { AgentState, AssistantContentBlock, ToolResultBlock, AgentCallbacks } from './core/types.js';

export type { AgentCallbacks };

export class Agent {
  // ── Instance state ───────────────────────────────────────
  private state: AgentState;

  constructor(private qtContext?: QtContext) {
    const client = createLLMClient(config.provider, config.apiKey, config.baseURL);
    const reflexionEngine = new ReflexionEngine(config.reflexion);
    const critiqueEngine = new CritiqueEngine();
    const planner = new Planner(config.planner);
    const treeOfThoughts = new TreeOfThoughts();
    const a2aProtocol = new A2AProtocol({}, globalAgentRegistry);

    const ctxManager = new AgentContextManager((max) => reflexionEngine.getLearnedPatterns(max));
    const toolExecutor = new AgentToolExecutor(reflexionEngine);
    const stateManager = new StateManager();
    const conversationManager = new ConversationManager();

    // Harness
    const tracer = Tracer.getInstance();
    const circuitBreakerManager = new CircuitBreakerManager();
    circuitBreakerManager.setDefaultConfig({
      failureThreshold: Number(process.env['CODEYANG_CB_THRESHOLD'] || '5'),
      resetTimeoutMs: Number(process.env['CODEYANG_CB_RESET_MS'] || '30000'),
      slowCallThresholdMs: Number(process.env['CODEYANG_CB_SLOW_MS'] || '30000'),
      windowSize: Number(process.env['CODEYANG_CB_WINDOW'] || '50'),
      failureRateThreshold: Number(process.env['CODEYANG_CB_RATE'] || '0.5'),
      minRequestCount: Number(process.env['CODEYANG_CB_MIN_REQ'] || '10'),
    });
    circuitBreakerManager.create('llm-api', {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      slowCallThresholdMs: 30_000,
    });
    circuitBreakerManager.create('tool-execute', {
      failureThreshold: 10,
      resetTimeoutMs: 15_000,
      slowCallThresholdMs: 60_000,
    });
    const gateway = Gateway.getInstance();

    globalAgentRegistry.register(a2aProtocol.getMyCard());
    a2aProtocol.setLLMClient(client, config.model, config.maxTokens);

    // Assemble state
    this.state = {
      client,
      cbs: {},
      maxRetries: config.maxRetries ?? 3,
      abortController: null,
      ctxManager,
      toolExecutor,
      stateManager,
      conversationManager,
      verificationPipeline: null,
      feedbackInjector: new FeedbackInjector(),
      watcher: null,
      reflexionEngine,
      critiqueEngine,
      planner,
      treeOfThoughts,
      a2aProtocol,
      consolidationCounter: 0,
      tracer,
      currentTraceId: '',
      circuitBreakerManager,
      gateway,
    };
  }

  // ── Public API ───────────────────────────────────────────

  setCallbacks(cbs: AgentCallbacks): void {
    this.state.cbs = cbs;
  }

  setWatcher(watcher: WatcherSystem | null): void {
    this.state.watcher = watcher;
  }
  setVerificationPipeline(pipeline: VerificationPipeline | null): void {
    this.state.verificationPipeline = pipeline;
  }

  get pendingFeedback(): boolean {
    return this.state.feedbackInjector.hasPending();
  }

  getLLMClient(): LLMClient {
    return this.state.client;
  }
  getReflexionEngine(): ReflexionEngine {
    return this.state.reflexionEngine;
  }
  getPlanner(): Planner {
    return this.state.planner;
  }

  // Harness accessors
  getTracer(): Tracer {
    return this.state.tracer;
  }
  getCircuitBreakerManager(): CircuitBreakerManager {
    return this.state.circuitBreakerManager;
  }
  getGateway(): Gateway {
    return this.state.gateway;
  }
  getCurrentTraceId(): string {
    return this.state.currentTraceId;
  }

  getHarnessStatus(): Record<string, unknown> {
    const cbStats = this.state.circuitBreakerManager.getAllStats();
    const traces = this.state.tracer.getTraces(5);
    let auditOps = 0;
    let auditReqs = 0;
    try {
      const auditLogger = this.state.gateway.getAuditLogger() as unknown as {
        getStats: () => Record<string, { total: number; failed: number; avgMs: number }>;
      };
      if (typeof auditLogger.getStats === 'function') {
        const auditStats = auditLogger.getStats();
        auditOps = Object.keys(auditStats).length;
        auditReqs = Object.values(auditStats).reduce((sum, s) => sum + s.total, 0);
      }
    } catch {
      // Ignore if audit logger doesn't have getStats
    }

    return {
      circuitBreakers: cbStats,
      tracing: {
        totalTraces: traces.length,
        recentTraces: traces.slice(0, 3).map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
        })),
      },
      gateway: {
        auditOps,
        auditReqs,
      },
    };
  }

  getStats(): {
    tokens: { input: number; output: number; total: number };
    turns: number;
    toolWeights: Array<{ name: string; weight: number; successRate: number; calls: number }>;
  } {
    const tokenUsage = this.state.stateManager.getTokenUsage();
    return {
      tokens: {
        input: tokenUsage.inputTokens,
        output: tokenUsage.outputTokens,
        total: tokenUsage.inputTokens + tokenUsage.outputTokens,
      },
      turns: this.state.conversationManager.getHistory().length,
      toolWeights: getAllToolWeights() as Array<{ name: string; weight: number; successRate: number; calls: number }>,
    };
  }

  getMessages(): Message[] {
    return this.exportMessages();
  }

  reset(): void {
    this.state.conversationManager.resetAll();
    this.state.stateManager.resetAll();
    this.state.critiqueEngine.reset();
    // ReflexionEngine and FeedbackInjector don't have reset methods
  }

  /** Main entry point: run a user message through the agent loop. */
  async run(userMsg: string): Promise<void> {
    await runLoop(this.state, userMsg, this.qtContext as unknown as string | undefined);
  }

  getClosedLoopStatus(): Record<string, unknown> {
    const reflexionStats = this.state.reflexionEngine.getStats();
    const recentExecs = this.state.reflexionEngine.getRecentExecutions(3);
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
      autoVerify: config.autoVerify && !!this.state.verificationPipeline,
      autoFixOnError: config.autoFixOnError,
      watchMode: config.watchMode && !!this.state.watcher,
      reflexion: {
        enabled: config.reflexion.enabled,
        consecutiveFailures: consecutiveFails,
        totalReflections: 0,
        recentErrors: reflexionStats.failed,
      },
      planner: {
        enabled: config.planner.enabled,
        activePlans: this.state.planner.getActivePlans().length,
        totalPlans: this.state.planner.getAllPlans().length,
      },
      rlWeights: {
        enabled: true,
        topPerformingTools: toolWeights,
        totalToolCalls: getAllToolWeights().reduce((sum: number, t: { calls: number }) => sum + t.calls, 0),
      },
    };
  }

  get apiKeySet(): boolean {
    return config.apiKey.length > 0;
  }

  getTokenUsage(): { inputTokens: number; outputTokens: number } {
    return this.state.stateManager.getTokenUsage();
  }

  saveCheckpoint(): number {
    this.state.conversationManager.saveCheckpoint();
    return this.state.conversationManager.getCheckpointCount() - 1;
  }

  restoreCheckpoint(): boolean {
    const count = this.state.conversationManager.getCheckpointCount();
    if (count === 0) return false;
    this.state.conversationManager.restoreCheckpoint(count - 1);
    return true;
  }

  listCheckpoints(): Array<{ index: number; messageCount: number }> {
    return this.state.conversationManager.listCheckpoints();
  }

  // ── Tool stats (delegate) ────────────────────────────────

  getToolStats() {
    return this.state.toolExecutor.getToolStats();
  }

  get checkpointCount(): number {
    return this.state.conversationManager.getCheckpointCount();
  }

  answerQuestion(answer: string) {
    this.state.stateManager.answerQuestion(answer);
  }

  cancelQuestion() {
    this.state.stateManager.cancelQuestion();
  }

  cancelRunningTools() {
    if (this.state.abortController) this.state.abortController.abort();
  }

  /**
   * Stop the current thinking/streaming process
   */
  stopThinking() {
    if (this.state.abortController) {
      this.state.abortController.abort();
      this.state.abortController = null;
    }
  }

  get isThinking(): boolean {
    return this.state.abortController !== null;
  }

  get waitingForAnswer(): boolean {
    return this.state.stateManager.hasPendingQuestion();
  }

  recordToolCall(name: string, ms: number, isError: boolean): void {
    this.state.toolExecutor.recordToolCall(name, ms, isError);
  }

  // ── Session serialization ────────────────────────────────

  /** Restore history from saved messages including tool_result blocks. */
  loadMessages(msgs: Message[]) {
    this.state.stateManager.resetRepetition();

    for (const m of msgs) {
      if (m.role === 'user') {
        if (m.toolResults && m.toolResults.length > 0) {
          const blocks: ToolResultBlock[] = m.toolResults.map((tr) => ({
            type: 'tool_result',
            tool_use_id: tr.tool || 'unknown',
            content: tr.output,
            is_error: tr.isError,
          }));
          this.state.conversationManager.addMessage({ role: 'user', content: blocks });
        } else {
          this.state.conversationManager.addMessage({ role: 'user', content: m.content });
        }
      } else if (m.role === 'assistant') {
        const blocks: AssistantContentBlock[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
          }
        }
        this.state.conversationManager.addMessage({ role: 'assistant', content: blocks });
      }
    }
  }

  /** Serialize history preserving tool_result blocks for session persistence. */
  exportMessages(): Message[] {
    return this.state.conversationManager.getHistory().map((m) => {
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
