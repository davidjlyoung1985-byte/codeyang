import Anthropic from '@anthropic-ai/sdk';
import type { Message, ToolCall, ToolResult } from '../types.js';
import { config } from './config.js';
import { toolSchemas, getTool, setToolContext } from '../tools/registry.js';
import type { QtContext } from '../qt/index.js';

export interface AgentCallbacks {
  onUserMessage?: (text: string) => void;
  onAgentText?: (text: string) => void;
  onAgentDelta?: (text: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, output: string, isError: boolean) => void;
  onQuestion?: (question: string, options?: Array<{ label: string; description: string }>) => void;
  onError?: (err: string) => void;
}

export class Agent {
  private client: Anthropic;
  private history: Anthropic.Messages.MessageParam[] = [];
  private cbs: AgentCallbacks = {};
  private questionResolve: ((answer: string) => void) | null = null;
  private maxRetries = 3;

  // Tool result cache — avoid re-reading unchanged files within a session
  private toolCache = new Map<string, { result: string; timestamp: number }>();
  private static CACHE_TTL_MS = 5_000;

  // Anti-repetition: track previous assistant text
  private lastAssistantText = '';
  private repeatCount = 0;

  constructor(private qtContext?: QtContext) {
    this.client = new Anthropic({ apiKey: config.apiKey });
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
      anthropicClient: this.client,
      model: config.model,
      maxTokens: config.maxTokens,
      cwd: process.cwd(),
    });

    const maxTurns = 20;

    for (let turn = 0; turn < maxTurns; turn++) {
      if (process.env['CODEX_DEBUG']) {
        process.stderr.write(`\n[DEBUG turn ${turn}] messages count: ${messages.length}\n`);
      }

      const streamResult = await this.withRetry(async () => {
        const s = this.client.messages.stream({
          model: config.model,
          max_tokens: config.maxTokens,
          temperature: 0.5,
          system: config.getSystemPrompt(this.qtContext),
          messages,
          tools: toolSchemas(),
        });

        const blocks: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
          input_json?: string;
        }> = [];
        const tcList: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        const textParts: string[] = [];
        let blockIdx = -1;

        for await (const event of s) {
          switch (event.type) {
            case 'content_block_start':
              blockIdx = event.index;
              blocks[blockIdx] = event.content_block as {
                type: string;
                text?: string;
                id?: string;
                name?: string;
                input?: unknown;
              };
              break;

            case 'content_block_delta':
              if (event.delta?.type === 'text_delta' && event.delta.text) {
                this.cbs.onAgentDelta?.(event.delta.text);
                textParts.push(event.delta.text);
                if (blocks[blockIdx]?.type === 'text') {
                  blocks[blockIdx].text = (blocks[blockIdx].text || '') + event.delta.text;
                }
              } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
                if (blocks[blockIdx]?.type === 'tool_use') {
                  blocks[blockIdx].input_json = (blocks[blockIdx].input_json || '') + event.delta.partial_json;
                }
              }
              break;

            case 'content_block_stop':
              if (blocks[blockIdx]?.type === 'tool_use') {
                try {
                  blocks[blockIdx].input = JSON.parse(blocks[blockIdx].input_json || '{}');
                } catch {
                  blocks[blockIdx].input = {};
                }
              }
              break;
          }
        }

        for (const b of blocks) {
          if (!b) continue;
          if (b.type === 'tool_use') {
            tcList.push({
              id: b.id!,
              name: b.name!,
              input: this.jsonClone(b.input || {}) as Record<string, unknown>,
            });
          }
        }

        return { blocks, toolCalls: tcList, assistantText: textParts.join('') };
      }, 'Anthropic streaming API call');

      const { blocks: contentBlocks, toolCalls, assistantText } = streamResult;

      const assistantContent: Array<
        { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
      > = contentBlocks
        .filter((b) => b && (b.type === 'text' || b.type === 'tool_use'))
        .map((b) => {
          if (b.type === 'text') return { type: 'text' as const, text: b.text || '' };
          return { type: 'tool_use' as const, id: b.id!, name: b.name!, input: this.jsonClone(b.input || {}) };
        });

      messages.push({ role: 'assistant', content: assistantContent });

      if (assistantText) {
        // Anti-repetition: check BEFORE displaying to user.
        // Break if the same text appears twice in a row (1 repeat).
        if (assistantText === this.lastAssistantText) {
          this.repeatCount++;
          if (this.repeatCount >= 1) {
            this.cbs.onError?.('Agent loop detected — stopping to avoid repetition');
            this.history = this.jsonClone(messages);
            break;
          }
        } else {
          this.repeatCount = 0;
        }
        this.lastAssistantText = assistantText;

        // Display only after passing the repetition check
        this.cbs.onAgentText?.(assistantText);
      }

      if (toolCalls.length === 0) {
        this.history = this.jsonClone(messages);
        break;
      }

      // Execute tools — parallel for speed, Question handled first
      const toolResults: ToolResult[] = [];
      const toolResultIds: string[] = [];

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

    setToolContext(null);
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
