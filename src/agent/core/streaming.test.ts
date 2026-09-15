import { describe, it, expect } from 'vitest';
import { streamLLM } from './streaming.js';
import { consumeStream } from '../LLMClient.js';
import type { LLMClient, StreamEvent } from '../LLMClient.js';
import type { AgentCallbacks } from './types.js';

/** Fake LLM client that replays a fixed event sequence. */
function fakeClient(events: StreamEvent[]): LLMClient {
  return {
    async *stream() {
      for (const event of events) yield event;
    },
  };
}

const params = {
  model: 'test-model',
  maxTokens: 8192,
  temperature: 0,
  system: '',
  messages: [],
  tools: [],
};

describe('consumeStream', () => {
  it('ignores thinking_delta and keeps only answer text', async () => {
    const client = fakeClient([
      { type: 'thinking_delta', text: 'chain of thought that must not leak' },
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ' world' },
    ]);

    const result = await consumeStream(client, params);

    expect(result.text).toBe('Hello world');
    expect(result.text).not.toContain('thought');
  });
});

describe('streamLLM', () => {
  it('dispatches thinking_delta via onThinkingDelta without polluting the answer', async () => {
    const client = fakeClient([
      { type: 'thinking_delta', text: 'reasoning step 1' },
      { type: 'thinking_delta', text: ' and step 2' },
      { type: 'text_delta', text: 'The answer.' },
      { type: 'usage', inputTokens: 10, outputTokens: 5 },
    ]);

    const thinking: string[] = [];
    const answerDeltas: string[] = [];
    const cbs: AgentCallbacks = {
      onThinkingDelta: (t) => thinking.push(t),
      onAgentDelta: (t) => answerDeltas.push(t),
    };

    const result = await streamLLM(
      client,
      'test-model',
      8192,
      'system',
      [{ role: 'user', content: 'hi' }],
      cbs,
      () => {},
    );

    // Reasoning is surfaced separately...
    expect(thinking.join('')).toBe('reasoning step 1 and step 2');
    // ...and never leaks into the answer or the returned text.
    expect(answerDeltas.join('')).toBe('The answer.');
    expect(result.assistantText).toBe('The answer.');
    expect(result.assistantText).not.toContain('reasoning');
  });

  it('still parses tool calls alongside thinking output', async () => {
    const client = fakeClient([
      { type: 'thinking_delta', text: 'I should read the file.' },
      { type: 'tool_call_start', toolCallIndex: 0, toolCallId: 't1', toolCallName: 'Read' },
      { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: '{"filePath":"a.ts"}' },
      { type: 'tool_call_end', toolCallIndex: 0, toolCallId: 't1', toolCallArgs: '{"filePath":"a.ts"}' },
    ]);

    const cbs: AgentCallbacks = { onThinkingDelta: () => {} };
    const result = await streamLLM(client, 'm', 8192, 'sys', [{ role: 'user', content: 'go' }], cbs, () => {});

    expect(result.toolCalls).toEqual([{ id: 't1', name: 'Read', input: { filePath: 'a.ts' } }]);
    expect(result.assistantText).toBe('');
  });
});
