import type { Message, ToolCall, ToolResult } from '../types.js';
import { config } from './config.js';
import { toolSchemas, getTool, setToolContext } from '../tools/registry.js';
import type { QtContext } from '../qt/index.js';
import { createLLMClient, type LLMClient, type LLMMessage, type ToolSchema } from './LLMClient.js';
import { getMemorySummary } from '../utils/memoryStore.js';
import { logger } from '../utils/logger.js';

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
  private client: LLMClient;
  private history: LLMMessage[] = [];
  private cbs: AgentCallbacks = {};
  private checkpoints: LLMMessage[][] = [];
  private questionResolve: ((answer: string) => void) | null = null;
  private maxRetries = 3;

  // AI response cache — avoid redundant LLM calls for identical inputs
  private responseCache = new Map<
    string,
    {
      result: { toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; assistantText: string };
      timestamp: number;
    }
  >();
  private static RESPONSE_CACHE_TTL = 0; // disabled: cache key is derived from session context which changes every turn, making the 60s TTL ineffective
  private static RESPONSE_CACHE_MAX_SIZE = 50;

  // Tool result cache — avoid re-reading unchanged files within a session
  private toolCache = new Map<string, { result: string; timestamp: number }>();
  private static CACHE_TTL_MS = 5_000;

  // Pending reads — deduplicate concurrent Read/Glob calls for the same key
  private pendingReads = new Map<string, Promise<string>>();

  // Anti-repetition: track previous assistant texts (fuzzy dedup)
  private lastAssistantText = '';
  private recentAssistantTexts: string[] = [];
  private repeatCount = 0;

  // Cancellation support for running tool batches
  private abortController: AbortController | null = null;

  // Token usage tracking across turns
  private tokenUsage = { inputTokens: 0, outputTokens: 0 };

  // Per-tool usage statistics for /stats command
  private toolStats = new Map<string, { calls: number; totalMs: number; errors: number }>();

  // Persistent memory cache
  private memorySummary: string | null = null;
  private memoryLoadFailure = false;

  constructor(private qtContext?: QtContext) {
    this.client = createLLMClient(config.provider, config.apiKey, config.baseURL);
  }

  private async ensureMemoryLoaded(): Promise<string> {
    if (this.memorySummary === null && !this.memoryLoadFailure) {
      try {
        this.memorySummary = await getMemorySummary();
      } catch {
        this.memoryLoadFailure = true;
        this.memorySummary = '';
      }
    }
    return this.memorySummary ?? '';
  }

  private cacheKey(name: string, args: Record<string, unknown>): string {
    return `${name}:${JSON.stringify(args)}`;
  }

  /** Build a deterministic cache key for AI responses from the full input context. */
  private getResponseCacheKey(system: string, messagesJson: string, toolsJson: string): string {
    // Use the last user message (the prompt) combined with system/tool fingerprints
    const lastUser = messagesJson.split('"role":"user"').pop()?.slice(0, 500) || '';
    return `${system.length}:${lastUser}:${toolsJson.length}`;
  }

  /** Check the response cache for a matching key (respects TTL). */
  private getResponseFromCache(
    key: string,
  ): { toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; assistantText: string } | null {
    const entry = this.responseCache.get(key);
    if (entry && Date.now() - entry.timestamp < Agent.RESPONSE_CACHE_TTL) {
      return entry.result;
    }
    this.responseCache.delete(key);
    return null;
  }

  /** Store a response in the cache, evicting oldest entry if at capacity. */
  private setResponseCache(
    key: string,
    result: { toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; assistantText: string },
  ): void {
    if (this.responseCache.size >= Agent.RESPONSE_CACHE_MAX_SIZE) {
      const oldest = this.responseCache.entries().next().value;
      if (oldest) this.responseCache.delete(oldest[0]);
    }
    this.responseCache.set(key, { result, timestamp: Date.now() });
  }

  private invalidateCache() {
    this.toolCache.clear();
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
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
          this.cbs.onError?.(`${label} attempt ${attempt}/${this.maxRetries} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
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
    this.responseCache.clear();
    this.invalidateCache();
    this.lastAssistantText = '';
    this.recentAssistantTexts = [];
    this.repeatCount = 0;
    this.tokenUsage = { inputTokens: 0, outputTokens: 0 };
    this.toolStats.clear();
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
      this.abortController = null;
    }
  }

  get waitingForAnswer(): boolean {
    return this.questionResolve !== null;
  }

  private jsonClone<T>(obj: T): T {
    if (obj === undefined) return undefined as T;
    return JSON.parse(JSON.stringify(obj));
  }

  /** Compute word-level Jaccard similarity between text and any recent response */
  private computeSimilarity(text: string): number {
    if (this.recentAssistantTexts.length === 0) return 0;

    const words = new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1),
    );
    if (words.size === 0) return 0;

    let maxSim = 0;
    for (const prev of this.recentAssistantTexts) {
      const prevWords = new Set(
        prev
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 1),
      );
      if (prevWords.size === 0) continue;

      let intersection = 0;
      for (const w of words) {
        if (prevWords.has(w)) intersection++;
      }
      const union = words.size + prevWords.size - intersection;
      const sim = union > 0 ? intersection / union : 0;
      if (sim > maxSim) maxSim = sim;
    }
    return maxSim;
  }

  async run(prompt: string): Promise<void> {
    const messages = this.jsonClone(this.history);

    // Pre-analysis: inject planning guidance for complex prompts
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
    });

    const maxTurns = config.maxTurns;

    // Context window management: if history is large, insert a summary
    // to prevent token overflow in long sessions
    const CONTEXT_SOFT_LIMIT = 40; // messages beyond this trigger summarization
    if (messages.length > CONTEXT_SOFT_LIMIT) {
      const keepRecent = 16; // target: keep this many most recent messages intact

      // Find a safe cut point that doesn't split tool_use/tool_result pairs.
      // If the first retained message is an assistant with tool_use blocks whose
      // corresponding tool_result landed in the summarized portion, the API
      // will reject the conversation with 422/400.
      let cutIndex = messages.length - keepRecent;
      while (cutIndex < messages.length) {
        const firstRetained = messages[cutIndex];
        const hasOrphanToolUse =
          firstRetained.role === 'assistant' &&
          Array.isArray(firstRetained.content) &&
          firstRetained.content.some((b: { type: string }) => b.type === 'tool_use');
        if (hasOrphanToolUse) {
          cutIndex++; // include this message in the summary instead
        } else {
          break;
        }
      }

      const toSummarize = messages.slice(0, cutIndex);

      // Build a compact summary of the summarized messages
      let summary = '[Prior context summary:\n';
      for (const m of toSummarize) {
        const content = typeof m.content === 'string' ? m.content : '';
        if (content.length > 0) {
          summary += `  ${m.role}: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}\n`;
        } else if (Array.isArray(m.content)) {
          const tools = m.content
            .filter((b: { type: string }) => b.type === 'tool_use')
            .map((b: { name?: string }) => b.name);
          const results = m.content.filter((b: { type: string }) => b.type === 'tool_result').length;
          if (tools.length > 0) summary += `  ${m.role}: used tools [${tools.join(', ')}]\n`;
          if (results > 0) summary += `  ${m.role}: ${results} tool results\n`;
        }
      }
      summary += ']';

      // Replace old messages with summary + keep recent ones
      const recent = messages.slice(cutIndex);
      messages.length = 0;
      messages.push({ role: 'user' as const, content: summary });
      messages.push(...recent);
    }

    for (let turn = 0; turn < maxTurns; turn++) {
      logger.debug(`[turn ${turn}] messages count: ${messages.length}`);

      // Build system prompt before LLM call for cache key derivation
      const memoryContext = await this.ensureMemoryLoaded();
      const systemPrompt = memoryContext
        ? config.getSystemPrompt(this.qtContext) + '\n\n## Your Memory\n' + memoryContext
        : config.getSystemPrompt(this.qtContext);

      // Check AI response cache before making the LLM call
      const cacheKey = this.getResponseCacheKey(systemPrompt, JSON.stringify(messages), JSON.stringify(toolSchemas()));
      const cachedResponse = this.getResponseFromCache(cacheKey);

      let toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
      let assistantText: string;

      if (cachedResponse) {
        // Cache hit — reuse previous LLM response without API call
        logger.debug(`[turn ${turn}] response cache HIT`);
        toolCalls = cachedResponse.toolCalls;
        assistantText = cachedResponse.assistantText;
      } else {
        // Cache miss — call LLM
        const streamResult = await this.withRetry(async () => {
          const textParts: string[] = [];
          const toolCallsInner: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
          const toolCallsAccum: Map<number, { id?: string; name?: string; args: string }> = new Map();

          for await (const event of this.client.stream({
            model: config.model,
            maxTokens: config.maxTokens,
            temperature: 0.5,
            system: systemPrompt,
            messages,
            tools: toolSchemas() as ToolSchema[],
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
                } catch {
                  toolCallsInner.push({ id: accum.id!, name: accum.name!, input: {} });
                }
              }
            } else if (event.type === 'usage') {
              if (event.inputTokens !== undefined) this.tokenUsage.inputTokens += event.inputTokens;
              if (event.outputTokens !== undefined) this.tokenUsage.outputTokens += event.outputTokens;
            }
          }

          return { toolCalls: toolCallsInner, assistantText: textParts.join('') };
        }, 'LLM streaming API call');

        // Store in response cache for future identical calls
        this.setResponseCache(cacheKey, streamResult);

        ({ toolCalls, assistantText } = streamResult);
      }

      const assistantContent: AssistantContentBlock[] = [];

      if (assistantText) {
        assistantContent.push({ type: 'text', text: assistantText });
      }

      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }

      messages.push({ role: 'assistant', content: assistantContent });

      if (assistantText) {
        // Anti-repetition with fuzzy matching:
        // 1. Exact match on consecutive turns → immediate stop
        // 2. High word overlap (>85%) with any of last 4 responses → stop
        if (assistantText === this.lastAssistantText) {
          this.repeatCount++;
          if (this.repeatCount >= 1) {
            this.cbs.onError?.('Agent loop detected (exact repeat) — stopping');
            // Fill in placeholder results for any pending tool calls so the API
            // history remains consistent (assistant + tool_use must be followed
            // by tool_result).
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
            this.history = this.jsonClone(messages);
            break;
          }
        } else {
          // Fuzzy check: compare with recent responses
          const similarity = this.computeSimilarity(assistantText);
          if (similarity > 0.85 && this.recentAssistantTexts.length >= 2) {
            this.cbs.onError?.('Agent loop detected (similar repeat) — stopping');
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
            this.history = this.jsonClone(messages);
            break;
          }
          this.repeatCount = 0;
        }

        this.lastAssistantText = assistantText;
        this.recentAssistantTexts.push(assistantText);
        if (this.recentAssistantTexts.length > 4) {
          this.recentAssistantTexts.shift();
        }

        // Text was already streamed via onAgentDelta deltas — skip onAgentText
        // to avoid duplicate output. Only fire for non-streamed responses.
        // this.cbs.onAgentText?.(assistantText); // removed: causes double output
      }

      if (toolCalls.length === 0) {
        this.history = this.jsonClone(messages);
        break;
      }

      // Execute tools — parallel for speed, Question handled first
      const toolResults: ToolResult[] = [];
      const toolResultIds: string[] = [];
      this.cbs.onToolBatch?.(toolCalls.length);
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      // Handle Question tool first (it blocks for user input)
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        toolResultIds[i] = tc.id;

        if (tc.name === 'Question') {
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

      // Execute all non-Question tools in parallel
      const parallelTasks = toolCalls.map(async (tc, i) => {
        if (tc.name === 'Question') return; // already handled above

        try {
          toolResultIds[i] = tc.id;

          const tool = getTool(tc.name);
          if (!tool) {
            toolResults[i] = { tool: tc.name, input: tc.input, output: `Unknown: ${tc.name}`, isError: true };
            this.cbs.onToolResult?.(tc.name, `Unknown: ${tc.name}`, true);
            return;
          }

          this.cbs.onToolStart?.(tc.name, tc.input);

          // Check cache for read-only tools (Read, Glob)
          const cacheable = tc.name === 'Read' || tc.name === 'Glob';
          const cacheKey = cacheable ? this.cacheKey(tc.name, tc.input) : undefined;
          if (cacheKey) {
            const cached = this.toolCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < Agent.CACHE_TTL_MS) {
              toolResults[i] = { tool: tc.name, input: tc.input, output: cached.result, isError: false };
              return;
            }

            // Deduplicate concurrent reads: if another call is already fetching
            // the same key, await that in-flight promise instead of re-executing.
            const pending = this.pendingReads.get(cacheKey);
            if (pending) {
              try {
                const output = await pending;
                toolResults[i] = { tool: tc.name, input: tc.input, output, isError: false };
                this.cbs.onToolResult?.(tc.name, output, false);
                return;
              } catch {
                // Pending read failed; fall through to retry
              }
            }
          }

          const t0 = Date.now();
          try {
            const executePromise = tool.execute(tc.input);

            // Register in-flight promise so concurrent calls for the same key can share it
            if (cacheKey) {
              this.pendingReads.set(cacheKey, executePromise);
            }

            const output = await executePromise;
            this.recordToolCall(tc.name, Date.now() - t0, false);
            toolResults[i] = { tool: tc.name, input: tc.input, output, isError: false };
            this.cbs.onToolResult?.(tc.name, output, false);

            // Cache successful read-only tool results
            if (cacheKey) {
              this.toolCache.set(cacheKey, { result: output, timestamp: Date.now() });
              this.pendingReads.delete(cacheKey);
            }

            // Invalidate caches on writes — filesystem state changed
            if (tc.name === 'Write' || tc.name === 'Edit') {
              this.invalidateCache();
              this.responseCache.clear();
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.recordToolCall(tc.name, Date.now() - t0, true);
            toolResults[i] = { tool: tc.name, input: tc.input, output: errorMsg, isError: true };
            this.cbs.onToolResult?.(tc.name, errorMsg, true);

            // Clean up pending read on failure so subsequent calls retry
            if (cacheKey) {
              this.pendingReads.delete(cacheKey);
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toolResults[i] = {
            tool: tc.name,
            input: tc.input,
            output: `Unexpected error in tool executor: ${errMsg}`,
            isError: true,
          };
        }
      });

      await Promise.all(parallelTasks);
      this.abortController = null;

      // Map results to tool_use_ids by position (handles duplicate tool names correctly)
      const toolResultContent: ToolResultBlock[] = toolResults.map((tr, i) => ({
        type: 'tool_result',
        tool_use_id: toolResultIds[i] ?? 'unknown',
        content: tr.output,
        is_error: tr.isError,
      }));

      messages.push({ role: 'user', content: toolResultContent });
      this.history = this.jsonClone(messages);
    }

    setToolContext(null);
  }

  /** Record a tool call for usage statistics. */
  recordToolCall(name: string, ms: number, isError: boolean): void {
    const s = this.toolStats.get(name) || { calls: 0, totalMs: 0, errors: 0 };
    s.calls++;
    s.totalMs += ms;
    if (isError) s.errors++;
    this.toolStats.set(name, s);
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

      // Extract tool_result parts — critical for session resumption
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
