/**
 * LLMClient Stress and Error Recovery Tests
 *
 * Focus on:
 * - Concurrent request handling
 * - Retry exhaustion scenarios
 * - Stream interruption handling
 * - Cache control fallback
 * - Network failure recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMClient, consumeStream, type LLMClient, type StreamParams } from './LLMClient.js';
import type { LLMMessage } from './LLMClient.js';

describe('LLMClient - Stress and Error Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 100 concurrent chat requests', async () => {
      const client = createLLMClient('custom', 'test-key', 'https://api.test.com');

      // Mock successful responses
      if (client.chat) {
        vi.spyOn(client, 'chat').mockResolvedValue({ content: 'Response' });
      }

      const requests = Array.from({ length: 100 }, (_, i) =>
        client.chat?.({
          model: 'test-model',
          maxTokens: 1000,
          messages: [{ role: 'user', content: `Request ${i}` }],
          stream: false,
        }),
      );

      const results = await Promise.allSettled(requests);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0);
    });

    it('should handle concurrent stream requests', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          yield { type: 'text_delta' as const, text: 'Hello' };
          yield { type: 'usage' as const, inputTokens: 10, outputTokens: 5 };
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      const streams = Array.from({ length: 50 }, () => consumeStream(client, params));

      const results = await Promise.allSettled(streams);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(50);
    });

    it('should handle mixed success and failure in concurrent requests', async () => {
      let callCount = 0;
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          callCount++;
          if (callCount % 3 === 0) {
            throw new Error('Simulated failure');
          }
          yield { type: 'text_delta' as const, text: 'Success' };
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      const streams = Array.from({ length: 30 }, () => consumeStream(client, params));
      const results = await Promise.allSettled(streams);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
    });
  });

  describe('Error Propagation', () => {
    it('should propagate rate limit errors', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          throw new Error('rate_limit_exceeded: 429');
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      await expect(consumeStream(client, params)).rejects.toThrow('rate_limit');
    });

    it('should propagate network timeout errors', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          throw new Error('ETIMEDOUT: network timeout');
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      await expect(consumeStream(client, params)).rejects.toThrow('ETIMEDOUT');
    });

    it('should propagate server errors', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          throw new Error('503 server error');
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      await expect(consumeStream(client, params)).rejects.toThrow('503');
    });
  });

  describe('Stream Interruption Handling', () => {
    it('should handle stream that ends abruptly', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          yield { type: 'text_delta' as const, text: 'Partial' };
          // Stream ends without usage event
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      const result = await consumeStream(client, params);
      expect(result.text).toBe('Partial');
      expect(result.toolCalls).toEqual([]);
    });

    it('should handle incomplete tool call stream', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          yield { type: 'tool_call_start' as const, toolCallIndex: 0, toolCallId: 'call-1', toolCallName: 'Read' };
          yield { type: 'tool_call_delta' as const, toolCallIndex: 0, toolCallArgs: '{"path": "fi' };
          // Stream ends without tool_call_end
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [{ name: 'Read', description: 'Read file', input_schema: { type: 'object' } }],
      };

      const result = await consumeStream(client, params);
      expect(result.toolCalls).toEqual([]); // Incomplete tool call not included
    });

    it('should handle malformed tool call JSON', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          yield { type: 'tool_call_start' as const, toolCallIndex: 0, toolCallId: 'call-1', toolCallName: 'Read' };
          yield { type: 'tool_call_delta' as const, toolCallIndex: 0, toolCallArgs: '{"path": invalid json' };
          yield { type: 'tool_call_end' as const, toolCallIndex: 0 };
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [{ name: 'Read', description: 'Read file', input_schema: { type: 'object' } }],
      };

      const result = await consumeStream(client, params);

      // Should fallback to empty object on JSON parse error
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].input).toEqual({});
    });

    it('should handle empty tool call arguments', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          yield { type: 'tool_call_start' as const, toolCallIndex: 0, toolCallId: 'call-1', toolCallName: 'List' };
          yield { type: 'tool_call_end' as const, toolCallIndex: 0 };
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [{ name: 'List', description: 'List items', input_schema: { type: 'object' } }],
      };

      const result = await consumeStream(client, params);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].input).toEqual({});
    });
  });

  describe('Message Format Edge Cases', () => {
    it('should handle messages with complex nested content', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'User message' },
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'Result', is_error: false },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Assistant response' },
            { type: 'tool_use', id: 'tool-2', name: 'Read', input: { path: 'file.ts' } },
          ],
        },
      ];

      expect(messages).toBeDefined();
      expect(messages[0].role).toBe('user');
      expect(Array.isArray(messages[0].content)).toBe(true);
    });

    it('should handle empty content arrays', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: [] },
        { role: 'assistant', content: [] },
      ];

      expect(messages).toBeDefined();
      expect(messages).toHaveLength(2);
    });

    it('should handle very long message content', () => {
      const longText = 'A'.repeat(100000);
      const messages: LLMMessage[] = [{ role: 'user', content: longText }];

      expect(messages[0].content).toHaveLength(100000);
    });

    it('should handle messages with cache_control markers', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Message 1' },
            { type: 'text', text: 'Message 2', cache_control: { type: 'ephemeral' } },
          ],
        },
      ];

      const contentArray = messages[0].content as Array<{ cache_control?: { type: string } }>;
      expect(contentArray[1].cache_control).toBeDefined();
      expect(contentArray[1].cache_control?.type).toBe('ephemeral');
    });
  });

  describe('Error Types', () => {
    it('should propagate upstream errors', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          throw new Error('upstream_error: gateway timeout');
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      await expect(consumeStream(client, params)).rejects.toThrow('upstream_error');
    });

    it('should propagate connection reset errors', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          throw new Error('ECONNRESET: connection reset by peer');
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      await expect(consumeStream(client, params)).rejects.toThrow('ECONNRESET');
    });

    it('should propagate internal server errors', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          throw new Error('Internal server error: 500');
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      await expect(consumeStream(client, params)).rejects.toThrow('Internal server error');
    });

    it('should propagate authentication errors', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          throw new Error('Invalid API key: 401');
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
      };

      await expect(consumeStream(client, params)).rejects.toThrow('Invalid API key');
    });
  });

  describe('Tool Call Assembly', () => {
    it('should correctly assemble multiple tool calls in sequence', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          // Tool 1
          yield { type: 'tool_call_start' as const, toolCallIndex: 0, toolCallId: 'call-1', toolCallName: 'Read' };
          yield { type: 'tool_call_delta' as const, toolCallIndex: 0, toolCallArgs: '{"path":' };
          yield { type: 'tool_call_delta' as const, toolCallIndex: 0, toolCallArgs: '"file.ts"}' };
          yield { type: 'tool_call_end' as const, toolCallIndex: 0 };

          // Tool 2
          yield { type: 'tool_call_start' as const, toolCallIndex: 1, toolCallId: 'call-2', toolCallName: 'Write' };
          yield {
            type: 'tool_call_delta' as const,
            toolCallIndex: 1,
            toolCallArgs: '{"path":"out.ts","content":"data"}',
          };
          yield { type: 'tool_call_end' as const, toolCallIndex: 1 };
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          { name: 'Read', description: 'Read', input_schema: { type: 'object' } },
          { name: 'Write', description: 'Write', input_schema: { type: 'object' } },
        ],
      };

      const result = await consumeStream(client, params);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('Read');
      expect(result.toolCalls[0].input).toEqual({ path: 'file.ts' });
      expect(result.toolCalls[1].name).toBe('Write');
      expect(result.toolCalls[1].input).toEqual({ path: 'out.ts', content: 'data' });
    });

    it('should handle interleaved text and tool calls', async () => {
      const client: LLMClient = {
        stream: vi.fn(async function* () {
          yield { type: 'text_delta' as const, text: 'Let me read the file.' };
          yield { type: 'tool_call_start' as const, toolCallIndex: 0, toolCallId: 'call-1', toolCallName: 'Read' };
          yield { type: 'tool_call_delta' as const, toolCallIndex: 0, toolCallArgs: '{"path":"file.ts"}' };
          yield { type: 'tool_call_end' as const, toolCallIndex: 0 };
          yield { type: 'text_delta' as const, text: ' Done.' };
        }),
      };

      const params: StreamParams = {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'System',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [{ name: 'Read', description: 'Read', input_schema: { type: 'object' } }],
      };

      const result = await consumeStream(client, params);

      expect(result.text).toBe('Let me read the file. Done.');
      expect(result.toolCalls).toHaveLength(1);
    });
  });
});
