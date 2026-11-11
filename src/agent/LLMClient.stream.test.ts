/**
 * Additional tests for LLMClient stream and retry functionality
 */
import { describe, it, expect } from 'vitest';
import { consumeStream, type LLMClient, type StreamEvent, type StreamParams } from './LLMClient.js';

describe('LLMClient - Stream Consumption', () => {
  describe('consumeStream', () => {
    it('should collect text deltas into complete text', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield { type: 'text_delta', text: 'Hello' } as StreamEvent;
          yield { type: 'text_delta', text: ' ' } as StreamEvent;
          yield { type: 'text_delta', text: 'world' } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('Hello world');
      expect(result.toolCalls).toEqual([]);
    });

    it('should collect tool calls with complete arguments', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'search',
          } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: '{"qu' } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: 'ery":"' } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: 'test"}' } as StreamEvent;
          yield { type: 'tool_call_end', toolCallIndex: 0 } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'call_1',
        name: 'search',
        input: { query: 'test' },
      });
    });

    it('should handle multiple tool calls in sequence', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'tool1',
          } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: '{}' } as StreamEvent;
          yield { type: 'tool_call_end', toolCallIndex: 0 } as StreamEvent;

          yield {
            type: 'tool_call_start',
            toolCallIndex: 1,
            toolCallId: 'call_2',
            toolCallName: 'tool2',
          } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 1, toolCallArgs: '{"x":1}' } as StreamEvent;
          yield { type: 'tool_call_end', toolCallIndex: 1 } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('tool1');
      expect(result.toolCalls[1].name).toBe('tool2');
      expect(result.toolCalls[1].input).toEqual({ x: 1 });
    });

    it('should combine text and tool calls', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield { type: 'text_delta', text: 'Using a tool: ' } as StreamEvent;
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'calculator',
          } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: '{"expr":"2+2"}' } as StreamEvent;
          yield { type: 'tool_call_end', toolCallIndex: 0 } as StreamEvent;
          yield { type: 'text_delta', text: ' to calculate.' } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('Using a tool:  to calculate.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].input).toEqual({ expr: '2+2' });
    });

    it('should handle usage events', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield { type: 'text_delta', text: 'Response' } as StreamEvent;
          yield { type: 'usage', inputTokens: 100, outputTokens: 50 } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('Response');
      // Usage events are emitted but not collected in StreamResult
    });

    it('should handle thinking deltas', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield { type: 'thinking_delta', text: 'Let me think...' } as StreamEvent;
          yield { type: 'text_delta', text: 'Answer' } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      // Thinking deltas are emitted but not included in text result
      expect(result.text).toBe('Answer');
    });

    it('should handle empty stream', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          // Empty stream
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('should handle invalid tool call JSON gracefully', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'tool',
          } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: '{invalid json' } as StreamEvent;
          yield { type: 'tool_call_end', toolCallIndex: 0 } as StreamEvent;
        },
      };

      // Should not throw, but tool call won't be added if JSON is invalid
      await expect(
        consumeStream(mockClient, {
          model: 'test-model',
          maxTokens: 1000,
          temperature: 0.7,
          system: 'Test system',
          messages: [],
          tools: [],
        }),
      ).resolves.toBeDefined();
    });

    it('should handle tool call without end event', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'tool',
          } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: '{"x":1}' } as StreamEvent;
          // Missing tool_call_end
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      // Tool call should not be added without end event
      expect(result.toolCalls).toEqual([]);
    });

    it('should handle cache hit events', async () => {
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield { type: 'text_delta', text: 'Cached response' } as StreamEvent;
          yield {
            type: 'usage',
            inputTokens: 50,
            outputTokens: 20,
            cacheReadTokens: 100,
          } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('Cached response');
    });

    it('should handle large tool arguments', async () => {
      const largeData = { data: 'x'.repeat(10000) };
      const mockClient: LLMClient = {
        async *stream(_params: StreamParams) {
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'process',
          } as StreamEvent;
          yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: JSON.stringify(largeData) } as StreamEvent;
          yield { type: 'tool_call_end', toolCallIndex: 0 } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 1000,
        temperature: 0.7,
        system: 'Test system',
        messages: [],
        tools: [],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].input).toEqual(largeData);
    });
  });
});
