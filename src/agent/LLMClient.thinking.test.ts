import { describe, it, expect, vi } from 'vitest';

// Mock the Anthropic SDK to emit a raw extended-thinking stream.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: () => ({
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'let me reason' } };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'content_block_start', index: 1, content_block: { type: 'text' } };
          yield { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Answer' } };
          yield { type: 'content_block_stop', index: 1 };
        },
      }),
    };
  },
}));

// Mock the OpenAI SDK to emit reasoning_content then content.
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: () => ({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { reasoning_content: 'raw reasoning' } }] };
            yield { choices: [{ delta: { content: 'Answer' } }] };
          },
        }),
      },
    };
  },
}));

import { createLLMClient } from './LLMClient.js';
import type { StreamEvent } from './LLMClient.js';

async function collect(events: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const params = { model: 'm', maxTokens: 1024, temperature: 0, system: '', messages: [], tools: [] };

describe('LLMClient parses reasoning streams', () => {
  it('emits thinking_delta for Anthropic extended-thinking streams', async () => {
    const client = createLLMClient('deepseek', 'sk-test', 'https://example.test/anthropic');
    const events = await collect(client.stream(params));

    const thinking = events
      .filter((e) => e.type === 'thinking_delta')
      .map((e) => e.text)
      .join('');
    const text = events
      .filter((e) => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');
    expect(thinking).toBe('let me reason');
    expect(text).toBe('Answer');
  });

  it('emits thinking_delta for OpenAI reasoning_content', async () => {
    const client = createLLMClient('custom', 'sk-test', 'https://example.test/v1');
    const events = await collect(client.stream(params));

    const thinking = events
      .filter((e) => e.type === 'thinking_delta')
      .map((e) => e.text)
      .join('');
    const text = events
      .filter((e) => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');
    expect(thinking).toBe('raw reasoning');
    expect(text).toBe('Answer');
  });
});
