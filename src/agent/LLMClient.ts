import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { convertToAnthropicMessages, convertToAnthropicTools, convertToOpenAIMessages } from './conversion-fns.js';

export interface StreamEvent {
  type: 'text_delta' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'usage';
  text?: string;
  toolCallIndex?: number;
  toolCallId?: string;
  toolCallName?: string;
  toolCallArgs?: string;
  /** Token usage (emitted at end of stream) */
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<{
        type: 'text' | 'tool_use' | 'tool_result';
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: string;
        is_error?: boolean;
      }>;
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: unknown;
    required?: string[];
    [k: string]: unknown;
  };
}

export interface StreamResult {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

export interface LLMClient {
  stream(params: {
    model: string;
    maxTokens: number;
    temperature: number;
    system: string;
    messages: LLMMessage[];
    tools: ToolSchema[];
  }): AsyncIterable<StreamEvent>;

  chat?(params: {
    model: string;
    maxTokens: number;
    messages: LLMMessage[];
    stream: boolean;
  }): Promise<{ content: string }>;
}

/**
 * Consume a stream into a complete result (non-streaming convenience).
 * Collects all text deltas and tool calls from the stream.
 */
export async function consumeStream(
  client: LLMClient,
  params: {
    model: string;
    maxTokens: number;
    temperature: number;
    system: string;
    messages: LLMMessage[];
    tools: ToolSchema[];
  },
): Promise<StreamResult> {
  const textParts: string[] = [];
  const toolCallsAccum: Map<number, { id?: string; name?: string; args: string }> = new Map();
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

  for await (const event of client.stream(params)) {
    if (event.type === 'text_delta' && event.text) {
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
    }
  }

  return { text: textParts.join(''), toolCalls };
}

export function createLLMClient(provider: string, apiKey: string, baseURL?: string): LLMClient {
  if (provider === 'deepseek') {
    return new AnthropicClient(apiKey, baseURL || 'https://api.deepseek.com/anthropic');
  }
  if (provider === 'custom') {
    return new OpenAICompatClient(apiKey, baseURL || 'https://api.deepseek.com/v1');
  }
  return new AnthropicClient(apiKey, baseURL);
}

class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
    if (baseURL) opts.baseURL = baseURL;
    this.client = new Anthropic(opts);
  }

  async chat(params: {
    model: string;
    maxTokens: number;
    messages: LLMMessage[];
    stream: boolean;
  }): Promise<{ content: string }> {
    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      messages: convertToAnthropicMessages(params.messages),
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return { content: textBlock && 'text' in textBlock ? textBlock.text : '' };
  }

  async *stream(params: {
    model: string;
    maxTokens: number;
    temperature: number;
    system: string;
    messages: LLMMessage[];
    tools: ToolSchema[];
  }): AsyncIterable<StreamEvent> {
    const stream = this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: params.system,
      messages: convertToAnthropicMessages(params.messages),
      tools: convertToAnthropicTools(params.tools),
    });

    let blockIdx = -1;
    const blocks: Array<{ type: string; id?: string; name?: string; input_json?: string }> = [];

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          blockIdx = event.index;
          blocks[blockIdx] = event.content_block as { type: string; id?: string; name?: string };
          if (event.content_block.type === 'tool_use') {
            yield {
              type: 'tool_call_start',
              toolCallIndex: blockIdx,
              toolCallId: event.content_block.id,
              toolCallName: event.content_block.name,
            };
          }
          break;

        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield { type: 'text_delta', text: event.delta.text };
          } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
            blocks[blockIdx].input_json = (blocks[blockIdx].input_json || '') + event.delta.partial_json;
            yield {
              type: 'tool_call_delta',
              toolCallIndex: blockIdx,
              toolCallArgs: event.delta.partial_json,
            };
          }
          break;

        case 'content_block_stop':
          if (blocks[blockIdx]?.type === 'tool_use') {
            yield {
              type: 'tool_call_end',
              toolCallIndex: blockIdx,
              toolCallId: blocks[blockIdx].id,
              toolCallArgs: blocks[blockIdx].input_json || '{}',
            };
          }
          break;

        case 'message_start':
          yield {
            type: 'usage',
            inputTokens: event.message.usage.input_tokens,
            outputTokens: event.message.usage.output_tokens,
          };
          break;

        case 'message_delta':
          if (event.usage) {
            yield {
              type: 'usage',
              inputTokens: event.usage.input_tokens ?? 0,
              outputTokens: event.usage.output_tokens ?? 0,
            };
          }
          break;
      }
    }
  }
}

class OpenAICompatClient implements LLMClient {
  private client: OpenAI;
  private baseURL: string;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.baseURL = baseURL;
  }

  async chat(params: {
    model: string;
    maxTokens: number;
    messages: LLMMessage[];
    stream: boolean;
  }): Promise<{ content: string }> {
    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens,
      messages: convertToOpenAIMessages(params.messages),
      stream: false,
    });

    return { content: response.choices[0]?.message?.content || '' };
  }

  async *stream(params: {
    model: string;
    maxTokens: number;
    temperature: number;
    system: string;
    messages: LLMMessage[];
    tools: ToolSchema[];
  }): AsyncIterable<StreamEvent> {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: params.system }];

    for (const msg of params.messages) {
      if (typeof msg.content === 'string') {
        // Plain text message — push as-is
        openaiMessages.push({ role: msg.role, content: msg.content });
        continue;
      }

      const textBlocks = msg.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
      const toolUseBlocks = msg.content.filter((b: { type: string }) => b.type === 'tool_use');
      const toolResultBlocks = msg.content.filter((b: { type: string }) => b.type === 'tool_result');

      // Assistant with tool_use → OpenAI tool_calls format
      if (msg.role === 'assistant' && toolUseBlocks.length > 0) {
        openaiMessages.push({
          role: 'assistant',
          content: textBlocks.map((b) => b.text).join('\n') || null,
          tool_calls: toolUseBlocks.map((tc) => ({
            id: tc.id!,
            type: 'function' as const,
            function: { name: tc.name!, arguments: JSON.stringify(tc.input || {}) },
          })),
        });
        continue;
      }

      // User with tool_result → OpenAI tool role messages
      // IMPORTANT: tool role messages MUST immediately follow the assistant
      // that declared the tool_calls. Never insert a user message between them.
      if (toolResultBlocks.length > 0) {
        for (const tr of toolResultBlocks) {
          openaiMessages.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id!,
            content: tr.content || '',
          });
        }
        // Any text blocks in the same user message are auxiliary (system notices).
        // They should NOT be pushed as a separate user message here, because
        // that would break the assistant(tool_calls) → tool(results) ordering.
        // If there's meaningful text content, emit it as a user message after
        // all tool results.
        if (textBlocks.length > 0 && toolResultBlocks.length === 0) {
          openaiMessages.push({ role: 'user', content: textBlocks.map((b) => b.text).join('\n') });
        }
        continue;
      }

      // Plain user/assistant with text only
      if (textBlocks.length > 0) {
        openaiMessages.push({ role: msg.role, content: textBlocks.map((b) => b.text).join('\n') });
      }
    }

    const stream = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: openaiMessages,
      tools: params.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
      stream: true,
    });

    const toolCallsAccum: Map<number, { id?: string; name?: string; args: string }> = new Map();

    for await (const chunk of stream) {
      // Check for usage info (sent in the final chunk when stream_options.include_usage is true)
      if (chunk.usage) {
        yield {
          type: 'usage',
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }

      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: 'text_delta', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallsAccum.has(idx)) {
            toolCallsAccum.set(idx, { id: tc.id, name: tc.function?.name, args: '' });
            yield {
              type: 'tool_call_start',
              toolCallIndex: idx,
              toolCallId: tc.id,
              toolCallName: tc.function?.name,
            };
          }

          const accum = toolCallsAccum.get(idx)!;
          if (tc.function?.arguments) {
            accum.args += tc.function.arguments;
            yield { type: 'tool_call_delta', toolCallIndex: idx, toolCallArgs: tc.function.arguments };
          }
        }
      }

      if (chunk.choices[0]?.finish_reason === 'tool_calls') {
        for (const [idx, accum] of toolCallsAccum.entries()) {
          yield { type: 'tool_call_end', toolCallIndex: idx, toolCallId: accum.id, toolCallArgs: accum.args };
        }
      }
    }
  }
}
