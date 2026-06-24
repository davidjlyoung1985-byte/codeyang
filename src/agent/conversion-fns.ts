import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { LLMMessage, ToolSchema } from './LLMClient.js';

/** Convert internal LLMMessage[] to Anthropic.MessageParam[] with field mapping */
export function convertToAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    const blocks = m.content.map((b: any) => {
      if (b.type === 'text') return { type: 'text' as const, text: b.text ?? '' };
      if (b.type === 'tool_use') return { type: 'tool_use' as const, id: b.id!, name: b.name!, input: b.input ?? {} };
      if (b.type === 'tool_result') {
        return {
          type: 'tool_result' as const,
          tool_use_id: b.tool_use_id!,
          content: b.content ?? '',
        };
      }
      return { type: 'text' as const, text: '' };
    });
    return { role: m.role, content: blocks };
  }) as Anthropic.MessageParam[];
}

/** Convert internal ToolSchema[] to Anthropic.Tool[] */
export function convertToAnthropicTools(tools: ToolSchema[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  })) as Anthropic.Tool[];
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
