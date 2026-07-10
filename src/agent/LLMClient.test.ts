import { describe, it, expect } from 'vitest';
import { createLLMClient, consumeStream, type LLMClient, type StreamEvent, type LLMMessage } from './LLMClient.js';

describe('LLMClient', () => {
  describe('createLLMClient', () => {
    it('should create deepseek client with correct baseURL', () => {
      const client = createLLMClient('deepseek', 'test-key');
      expect(client).toBeDefined();
      expect(client.stream).toBeDefined();
    });

    it('should create custom client with custom baseURL', () => {
      const client = createLLMClient('custom', 'test-key', 'https://custom.api.com');
      expect(client).toBeDefined();
    });

    it('should default to Anthropic client for unknown providers', () => {
      const client = createLLMClient('unknown', 'test-key');
      expect(client).toBeDefined();
    });

    it('should create Anthropic client with custom baseURL', () => {
      const client = createLLMClient('anthropic', 'test-key', 'https://custom.anthropic.com');
      expect(client).toBeDefined();
    });
  });

  describe('consumeStream', () => {
    it('should collect text deltas from stream', async () => {
      const mockClient: LLMClient = {
        async *stream() {
          yield { type: 'text_delta', text: 'Hello' } as StreamEvent;
          yield { type: 'text_delta', text: ' ' } as StreamEvent;
          yield { type: 'text_delta', text: 'World' } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        system: 'test',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('Hello World');
      expect(result.toolCalls).toEqual([]);
    });

    it('should collect tool calls from stream', async () => {
      const mockClient: LLMClient = {
        async *stream() {
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_123',
            toolCallName: 'test_tool',
          } as StreamEvent;
          yield {
            type: 'tool_call_delta',
            toolCallIndex: 0,
            toolCallArgs: '{"arg":',
          } as StreamEvent;
          yield {
            type: 'tool_call_delta',
            toolCallIndex: 0,
            toolCallArgs: '"value"}',
          } as StreamEvent;
          yield {
            type: 'tool_call_end',
            toolCallIndex: 0,
          } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        system: 'test',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'call_123',
        name: 'test_tool',
        input: { arg: 'value' },
      });
    });

    it('should handle mixed text and tool calls', async () => {
      const mockClient: LLMClient = {
        async *stream() {
          yield { type: 'text_delta', text: 'Processing...' } as StreamEvent;
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'read_file',
          } as StreamEvent;
          yield {
            type: 'tool_call_delta',
            toolCallIndex: 0,
            toolCallArgs: '{"path":"test.txt"}',
          } as StreamEvent;
          yield {
            type: 'tool_call_end',
            toolCallIndex: 0,
          } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        system: 'test',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('Processing...');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('read_file');
    });

    it('should handle invalid JSON in tool args gracefully', async () => {
      const mockClient: LLMClient = {
        async *stream() {
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_bad',
            toolCallName: 'bad_tool',
          } as StreamEvent;
          yield {
            type: 'tool_call_delta',
            toolCallIndex: 0,
            toolCallArgs: '{invalid json',
          } as StreamEvent;
          yield {
            type: 'tool_call_end',
            toolCallIndex: 0,
          } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        system: 'test',
        messages: [],
        tools: [],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].input).toEqual({});
    });

    it('should handle empty stream', async () => {
      const mockClient: LLMClient = {
        async *stream() {
          // Empty stream
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        system: 'test',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('should handle usage events', async () => {
      const mockClient: LLMClient = {
        async *stream() {
          yield { type: 'text_delta', text: 'test' } as StreamEvent;
          yield {
            type: 'usage',
            inputTokens: 100,
            outputTokens: 50,
          } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        system: 'test',
        messages: [],
        tools: [],
      });

      expect(result.text).toBe('test');
    });

    it('should handle multiple tool calls in sequence', async () => {
      const mockClient: LLMClient = {
        async *stream() {
          // First tool call
          yield {
            type: 'tool_call_start',
            toolCallIndex: 0,
            toolCallId: 'call_1',
            toolCallName: 'tool_1',
          } as StreamEvent;
          yield {
            type: 'tool_call_delta',
            toolCallIndex: 0,
            toolCallArgs: '{"x":1}',
          } as StreamEvent;
          yield {
            type: 'tool_call_end',
            toolCallIndex: 0,
          } as StreamEvent;

          // Second tool call
          yield {
            type: 'tool_call_start',
            toolCallIndex: 1,
            toolCallId: 'call_2',
            toolCallName: 'tool_2',
          } as StreamEvent;
          yield {
            type: 'tool_call_delta',
            toolCallIndex: 1,
            toolCallArgs: '{"y":2}',
          } as StreamEvent;
          yield {
            type: 'tool_call_end',
            toolCallIndex: 1,
          } as StreamEvent;
        },
      };

      const result = await consumeStream(mockClient, {
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        system: 'test',
        messages: [],
        tools: [],
      });

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('tool_1');
      expect(result.toolCalls[1].name).toBe('tool_2');
    });
  });

  describe('LLMClient interface', () => {
    it('should have stream method', () => {
      const client = createLLMClient('deepseek', 'test-key');
      expect(typeof client.stream).toBe('function');
    });

    it('should have optional chat method', () => {
      const client = createLLMClient('deepseek', 'test-key');
      // chat is optional, so it may or may not exist
      if (client.chat) {
        expect(typeof client.chat).toBe('function');
      }
    });
  });

  describe('Message types', () => {
    it('should handle string content messages', () => {
      const message: LLMMessage = {
        role: 'user',
        content: 'Hello',
      };
      expect(message.content).toBe('Hello');
    });

    it('should handle array content messages', () => {
      const message: LLMMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: '1', name: 'test', input: {} },
        ],
      };
      expect(Array.isArray(message.content)).toBe(true);
      expect(message.content).toHaveLength(2);
    });

    it('should handle tool result messages', () => {
      const message: LLMMessage = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: 'result',
            is_error: false,
          },
        ],
      };
      expect(Array.isArray(message.content)).toBe(true);
    });
  });
});
