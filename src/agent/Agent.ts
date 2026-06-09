import type { Message, ToolCall, ToolResult } from '../types.js';
import { config } from './config.js';
import { toolSchemas, getTool, setToolContext } from '../tools/registry.js';
import type { QtContext } from '../qt/index.js';
import { createLLMClient, type LLMClient, type LLMMessage, type ToolSchema } from './LLMClient.js';
import { getMemorySummary } from '../utils/memoryStore.js';

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
  private questionResolve: ((answer: string) => void) | null = null;
  private maxRetries = 3;

  // Tool result cache — avoid re-reading unchanged files within a session
  private toolCache = new Map<string, { result: string; timestamp: number }>();
  private static CACHE_TTL_MS = 5_000;

  // Anti-repetition: track previous assistant text
  private lastAssistantText = '';
  private repeatCount = 0;

  // Token usage tracking
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

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

  /** Clear conversation history and start fresh */
  reset() {
    this.history = [];
    this.invalidateCache();
    this.lastAssistantText = '';
    this.repeatCount = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  /** Get accumulated token usage for the current session */
  getTokenUsage(): { inputTokens: number; outputTokens: number } {
    return { inputTokens: this.totalInputTokens, outputTokens: this.totalOutputTokens };
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

  get waitingForAnswer(): boolean {
    return this.questionResolve !== null;
  }

  private jsonClone<T>(obj: T): T {
    if (obj === undefined) return undefined as T;
    return JSON.parse(JSON.stringify(obj));
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
      llmClient: this.client,
      model: config.model,
      maxTokens: config.maxTokens,
      cwd: process.cwd(),
    });

    try {
      const maxTurns = config.maxTurns;

    for (let turn = 0; turn < maxTurns; turn++) {
      if (process.env['CODEX_DEBUG'] || process.env['DEBUG']) {
        process.stderr.write(`\n[DEBUG turn ${turn}] messages count: ${messages.length}\n`);
      }

      const streamResult = await this.withRetry(async () => {
        if (process.env['DEBUG']) {
          console.error('[DEBUG Agent.run] Starting stream request...');
        }

        const textParts: string[] = [];
        const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        const toolCallsAccum: Map<number, { id?: string; name?: string; args: string }> = new Map();

        const memoryContext = await this.ensureMemoryLoaded();
        const systemPrompt = memoryContext
          ? config.getSystemPrompt(this.qtContext) + '\n\n## Your Memory\n' + memoryContext
          : config.getSystemPrompt(this.qtContext);

        const schemas = toolSchemas() as ToolSchema[];

        if (process.env['DEBUG']) {
          console.error('[DEBUG Agent.run] System prompt length:', systemPrompt.length);
          console.error('[DEBUG Agent.run] Tools count:', schemas.length);
          console.error('[DEBUG Agent.run] Starting client.stream...');
        }

        let streamStarted = false;
        let eventCount = 0;
        try {
          if (process.env['DEBUG']) {
            console.error('[DEBUG Agent.run] Calling this.client.stream with', {
              model: config.model,
              maxTokens: config.maxTokens,
              messagesLength: messages.length,
              toolsLength: schemas.length
            });
          }

          for await (const event of this.client.stream({
            model: config.model,
            maxTokens: config.maxTokens,
            temperature: 0.5,
            system: systemPrompt,
            messages,
            tools: schemas,
          })) {
            streamStarted = true;
            eventCount++;

            if (process.env['DEBUG'] && eventCount <= 5) {
              console.error(`[DEBUG Agent.run] Event ${eventCount}:`, event.type);
            }

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
                  toolCalls.push({
                    id: accum.id!,
                    name: accum.name!,
                    input: JSON.parse(accum.args || '{}'),
                  });
                } catch {
                  toolCalls.push({ id: accum.id!, name: accum.name!, input: {} });
                }
              }
            } else if (event.type === 'usage') {
              if (event.inputTokens) this.totalInputTokens += event.inputTokens;
              if (event.outputTokens) this.totalOutputTokens += event.outputTokens;
            }
          }
        } catch (err) {
          if (!streamStarted) {
            throw new Error(`Failed to establish connection with API: ${err instanceof Error ? err.message : String(err)}`);
          }
          throw err;
        }

        if (!streamStarted) {
          throw new Error('Stream did not start - no response from API. Verify model name and API configuration.');
        }

        return { toolCalls, assistantText: textParts.join('') };
      }, 'LLM streaming API call');

      const { toolCalls, assistantText } = streamResult;

      const assistantContent: Array<
        { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
      > = [];

      if (assistantText) {
        assistantContent.push({ type: 'text', text: assistantText });
      }

      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }

      messages.push({ role: 'assistant', content: assistantContent });

      if (assistantText) {
        // Anti-repetition: check BEFORE displaying to user.
        // Break if the same text appears 3+ times in a row (2 repeats).
        if (assistantText === this.lastAssistantText) {
          this.repeatCount++;
          if (this.repeatCount >= 2) {
            this.cbs.onError?.('Agent loop detected — stopping to avoid repetition');
            this.history = this.jsonClone(messages);
            break;
          }
        } else {
          this.repeatCount = 0;
        }
        this.lastAssistantText = assistantText;

        // Text was already streamed via onAgentDelta, no need to call onAgentText
        // unless there was no streaming (e.g., text was returned all at once)
      }

      if (toolCalls.length === 0) {
        this.history = this.jsonClone(messages);
        break;
      }

      // Execute tools — parallel for speed, Question handled first
      const toolResults: ToolResult[] = [];
      const toolResultIds: string[] = [];
      this.cbs.onToolBatch?.(toolCalls.length);

      // Handle Question tool first (it blocks for user input)
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        toolResultIds[i] = tc.id;

        if (tc.name === 'Question') {
          const q = String(tc.input['question'] ?? '');
          const options = Array.isArray(tc.input['options'])
            ? (tc.input['options'] as Array<{ label: string; description: string }>)
            : undefined;
          this.cbs.onQuestion?.(q, options);
          const answer = await new Promise<string>((resolve) => {
            this.questionResolve = resolve;
          });
          toolResults[i] = { tool: tc.name, input: tc.input, output: answer, isError: false };
        }
      }

      // Execute all non-Question tools in parallel
      const parallelTasks = toolCalls.map(async (tc, i) => {
        if (tc.name === 'Question') return; // already handled above

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
        if (cacheable) {
          const key = this.cacheKey(tc.name, tc.input);
          const cached = this.toolCache.get(key);
          if (cached && Date.now() - cached.timestamp < Agent.CACHE_TTL_MS) {
            toolResults[i] = { tool: tc.name, input: tc.input, output: cached.result, isError: false };
            return;
          }
        }

        try {
          const output = await tool.execute(tc.input);
          toolResults[i] = { tool: tc.name, input: tc.input, output, isError: false };
          this.cbs.onToolResult?.(tc.name, output, false);

          // Cache successful reads
          if (cacheable) {
            this.toolCache.set(this.cacheKey(tc.name, tc.input), { result: output, timestamp: Date.now() });
          }

          // Invalidate cache on writes
          if (tc.name === 'Write' || tc.name === 'Edit') {
            this.invalidateCache();
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          toolResults[i] = { tool: tc.name, input: tc.input, output: errorMsg, isError: true };
          this.cbs.onToolResult?.(tc.name, errorMsg, true);
        }
      });

      await Promise.all(parallelTasks);

      // Map results to tool_use_ids by position (handles duplicate tool names correctly)
      const toolResultContent: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }> =
        toolResults.map((tr, i) => ({
          type: 'tool_result',
          tool_use_id: toolResultIds[i] ?? 'unknown',
          content: tr.output,
          is_error: tr.isError,
        }));

      messages.push({ role: 'user', content: toolResultContent });
      this.history = this.jsonClone(messages);
    }
  } finally {
    setToolContext(null);
  }
  }

  /** Restore history from saved messages including tool_result blocks */
  loadMessages(msgs: Message[]) {
    // Reset anti-repetition state when loading a new session
    this.lastAssistantText = '';
    this.repeatCount = 0;

    for (const m of msgs) {
      if (m.role === 'user') {
        if (m.toolResults && m.toolResults.length > 0) {
          // Reconstruct tool_result blocks for session resumption
          const blocks: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> =
            m.toolResults.map((tr) => ({
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
        const blocks: Array<
          { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
        > = [];
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

      // Extract text parts
      const textParts = m.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');

      // Extract tool_use parts
      const toolUseParts = m.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: (b as { id: string }).id,
          name: (b as { name: string }).name,
          args: (b as { input: Record<string, unknown> }).input,
        }));

      // Extract tool_result parts — critical for session resumption
      const toolResultParts = m.content
        .filter((b) => b.type === 'tool_result')
        .map((b) => {
          const tr = b as { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
          return {
            tool: tr.tool_use_id,
            input: {} as Record<string, unknown>,
            output: tr.content,
            isError: tr.is_error === true,
          };
        });

      return {
        role: m.role as 'user' | 'assistant',
        content: textParts,
        toolCalls: toolUseParts.length > 0 ? (toolUseParts as ToolCall[]) : undefined,
        toolResults: toolResultParts.length > 0 ? (toolResultParts as ToolResult[]) : undefined,
      };
    });
  }
}
