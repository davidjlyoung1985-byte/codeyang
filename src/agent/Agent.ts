import Anthropic from '@anthropic-ai/sdk';
import type { Message, ToolCall, ToolResult } from '../types.js';
import { config } from './config.js';
import { tools, toolSchemas, getTool } from '../tools/registry.js';

export interface AgentCallbacks {
  onUserMessage?: (text: string) => void;
  onAgentText?: (text: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, output: string, isError: boolean) => void;
  onQuestion?: (question: string) => void;
  onError?: (err: string) => void;
}

export class Agent {
  private client: Anthropic;
  private history: Anthropic.Messages.MessageParam[] = [];
  private cbs: AgentCallbacks = {};
  private questionResolve: ((answer: string) => void) | null = null;

  constructor() {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  setCallbacks(cbs: AgentCallbacks) {
    this.cbs = cbs;
  }

  get apiKeySet(): boolean {
    return config.apiKey.length > 0;
  }

  answerQuestion(answer: string) {
    if (this.questionResolve) {
      this.questionResolve(answer);
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
    messages.push({ role: 'user', content: prompt });
    this.cbs.onUserMessage?.(prompt);

    const maxTurns = 20;

    for (let turn = 0; turn < maxTurns; turn++) {
      if (process.env['CODEX_DEBUG']) {
        process.stderr.write(`\n[DEBUG turn ${turn}] messages count: ${messages.length}\n`);
      }
      const response = await this.client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        system: config.systemPrompt,
        messages,
        tools: toolSchemas(),
      });

      const contentBlocks = response.content;
      let assistantText = '';
      const toolCalls: ToolCall[] = [];

      for (const block of contentBlocks) {
        if (block.type === 'text') {
          assistantText += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            args: this.jsonClone(block.input) as Record<string, unknown>,
          });
        }
      }

      const assistantContent: Anthropic.Messages.ContentBlockParam[] = contentBlocks
        .filter(b => b.type === 'text' || b.type === 'tool_use')
        .map(b => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          return { type: 'tool_use', id: b.id, name: b.name, input: this.jsonClone(b.input) };
        });

      messages.push({ role: 'assistant', content: assistantContent });

      if (assistantText) {
        this.cbs.onAgentText?.(assistantText);
      }

      if (toolCalls.length === 0) {
        this.history = this.jsonClone(messages);
        break;
      }

      const toolResults: ToolResult[] = [];
      for (const tc of toolCalls) {
        const tool = getTool(tc.name);
        if (!tool) {
          toolResults.push({ tool: tc.name, input: tc.args, output: `Unknown: ${tc.name}`, isError: true });
          continue;
        }

        if (tc.name === 'Question') {
          const q = String(tc.args['question'] ?? '');
          this.cbs.onQuestion?.(q);
          const answer = await new Promise<string>(resolve => { this.questionResolve = resolve; });
          toolResults.push({ tool: tc.name, input: tc.args, output: answer, isError: false });
          continue;
        }

        this.cbs.onToolStart?.(tc.name, tc.args);

        try {
          const output = await tool.execute(tc.args);
          toolResults.push({ tool: tc.name, input: tc.args, output, isError: false });
          this.cbs.onToolResult?.(tc.name, output, false);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          toolResults.push({ tool: tc.name, input: tc.args, output: errorMsg, isError: true });
          this.cbs.onToolResult?.(tc.name, errorMsg, true);
        }
      }

      const toolCallIdMap = new Map(toolCalls.map(tc => [tc.name, tc.id]));
      const toolResultContent: Anthropic.Messages.ContentBlockParam[] = toolResults.map(tr => ({
        type: 'tool_result',
        tool_use_id: toolCallIdMap.get(tr.tool) ?? toolCallIdMap.values().next().value ?? 'unknown',
        content: tr.output,
        is_error: tr.isError,
      }));

      messages.push({ role: 'user', content: toolResultContent });
      this.history = this.jsonClone(messages);
    }
  }

  loadMessages(msgs: Message[]) {
    for (const m of msgs) {
      if (m.role === 'user') {
        this.history.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const blocks: Anthropic.Messages.ContentBlockParam[] = [];
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

  exportMessages(): Message[] {
    return this.history.map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: m.content };
      }
      const textParts = m.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
      const toolUseParts = m.content.filter(b => b.type === 'tool_use').map(b => ({
        id: (b as { id: string }).id,
        name: (b as { name: string }).name,
        args: (b as { input: Record<string, unknown> }).input,
      }));
      return {
        role: m.role as 'user' | 'assistant',
        content: textParts,
        toolCalls: toolUseParts.length > 0 ? toolUseParts as ToolCall[] : undefined,
      };
    });
  }
}
