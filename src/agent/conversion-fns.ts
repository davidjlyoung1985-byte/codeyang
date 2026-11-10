import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { LLMMessage, ToolSchema } from './LLMClient.js';

/** Convert internal LLMMessage[] to Anthropic.MessageParam[] with field mapping */
export function convertToAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    const blocks = m.content.map(
      (b: {
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: string;
        cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
      }) => {
        // `cache_control` is a beta field in SDK 0.32, so it is forwarded via a
        // widened return type rather than the published block interfaces.
        const cc = b.cache_control;
        if (b.type === 'text') {
          const block: Record<string, unknown> = { type: 'text', text: b.text ?? '' };
          if (cc) block['cache_control'] = cc;
          return block;
        }
        if (b.type === 'tool_use') {
          const block: Record<string, unknown> = { type: 'tool_use', id: b.id!, name: b.name!, input: b.input ?? {} };
          if (cc) block['cache_control'] = cc;
          return block;
        }
        if (b.type === 'tool_result') {
          const block: Record<string, unknown> = {
            type: 'tool_result',
            tool_use_id: b.tool_use_id!,
            content: b.content ?? '',
          };
          if (cc) block['cache_control'] = cc;
          return block;
        }
        return { type: 'text', text: '' };
      },
    );
    return { role: m.role, content: blocks };
  }) as unknown as Anthropic.MessageParam[];
}

/** Convert internal ToolSchema[] to Anthropic.Tool[] */
export function convertToAnthropicTools(tools: ToolSchema[]): Anthropic.Tool[] {
  return tools.map((t) => {
    const tool: Record<string, unknown> = {
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    };
    // Forward the cache breakpoint when present (see prompt-cache.ts).
    const cc = (t as ToolSchema & { cache_control?: unknown }).cache_control;
    if (cc) tool['cache_control'] = cc;
    return tool;
  }) as unknown as Anthropic.Tool[];
}

/** Convert internal LLMMessage[] to OpenAI ChatCompletionMessageParam[] */
export function convertToOpenAIMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    const textBlocks = msg.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
    const toolUseBlocks = msg.content.filter((b: { type: string }) => b.type === 'tool_use');
    const toolResultBlocks = msg.content.filter((b: { type: string }) => b.type === 'tool_result');

    if (msg.role === 'assistant' && toolUseBlocks.length > 0) {
      result.push({
        role: 'assistant',
        content: textBlocks.map((b) => b.text).join('\n') || null,
        tool_calls: toolUseBlocks.map((tc) => ({
          id: tc.id!,
          type: 'function' as const,
          function: { name: tc.name!, arguments: JSON.stringify(tc.input || {}) },
        })),
      } as unknown as OpenAI.Chat.ChatCompletionMessageParam);
      continue;
    }

    if (toolResultBlocks.length > 0) {
      for (const tr of toolResultBlocks) {
        result.push({
          role: 'tool',
          tool_call_id: tr.tool_use_id!,
          content: tr.content || '',
        });
      }
      if (textBlocks.length > 0) {
        result.push({ role: 'user', content: textBlocks.map((b) => b.text).join('\n') });
      }
      continue;
    }

    if (textBlocks.length > 0) {
      result.push({ role: msg.role, content: textBlocks.map((b) => b.text).join('\n') });
    }
  }

  return result;
}
