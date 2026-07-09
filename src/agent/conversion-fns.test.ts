import { describe, it, expect } from 'vitest';
import { convertToAnthropicMessages, convertToAnthropicTools, convertToOpenAIMessages } from './conversion-fns.js';
import type { LLMMessage, ToolSchema } from './LLMClient.js';

describe('conversion-fns', () => {
  describe('convertToAnthropicMessages', () => {
    it('should convert simple string messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    });

    it('should convert messages with text blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is 2+2?' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: [{ type: 'text', text: 'What is 2+2?' }],
      });
    });

    it('should convert messages with tool_use blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me calculate that' },
            { type: 'tool_use', id: 'call_1', name: 'calculator', input: { expression: '2+2' } },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toHaveLength(2);
      const content = result[0].content as Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }>;
      expect(content[0]).toEqual({ type: 'text', text: 'Let me calculate that' });
      expect(content[1]).toEqual({
        type: 'tool_use',
        id: 'call_1',
        name: 'calculator',
        input: { expression: '2+2' },
      });
    });

    it('should convert messages with tool_result blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '4' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      const content = result[0].content as Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: string;
      }>;
      expect(content[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_1',
        content: '4',
      });
    });

    it('should handle empty text fields', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      const content = result[0].content as Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: string;
      }>;
      expect(content[0]).toEqual({ type: 'text', text: '' });
    });

    it('should handle missing input in tool_use', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'test' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      const content = result[0].content as Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: string;
      }>;
      expect(content[0].input).toEqual({});
    });

    it('should handle unknown block types', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'unknown_type' } as { type: string }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      const content = result[0].content as Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: string;
      }>;
      expect(content[0]).toEqual({ type: 'text', text: '' });
    });

    it('should handle mixed content types', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Processing...' },
            { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'test.txt' } },
            { type: 'text', text: 'Done' },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      const content = result[0].content as Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: string;
      }>;
      expect(content).toHaveLength(3);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('tool_use');
      expect(content[2].type).toBe('text');
    });
  });

  describe('convertToAnthropicTools', () => {
    it('should convert tool schemas', () => {
      const tools: ToolSchema[] = [
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ];

      const result = convertToAnthropicTools(tools);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('read_file');
      expect(result[0].description).toBe('Read a file');
      expect(result[0].input_schema).toEqual({
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      });
    });

    it('should handle empty tools array', () => {
      const result = convertToAnthropicTools([]);
      expect(result).toEqual([]);
    });

    it('should handle multiple tools', () => {
      const tools: ToolSchema[] = [
        {
          name: 'tool1',
          description: 'First tool',
          input_schema: { type: 'object', properties: {} },
        },
        {
          name: 'tool2',
          description: 'Second tool',
          input_schema: { type: 'object', properties: {} },
        },
      ];

      const result = convertToAnthropicTools(tools);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool2');
    });
  });

  describe('convertToOpenAIMessages', () => {
    it('should convert simple string messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi' });
    });

    it('should convert assistant messages with tool calls', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check' },
            { type: 'tool_use', id: 'call_1', name: 'search', input: { query: 'test' } },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      const msgWithToolCalls = result[0] as {
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
      };
      expect(msgWithToolCalls.tool_calls).toHaveLength(1);
      expect(msgWithToolCalls.tool_calls?.[0]).toEqual({
        id: 'call_1',
        type: 'function',
        function: { name: 'search', arguments: '{"query":"test"}' },
      });
    });

    it('should convert tool result messages', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'Result data' }],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'Result data',
      });
    });

    it('should handle multiple tool results', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'Result 1' },
            { type: 'tool_result', tool_use_id: 'call_2', content: 'Result 2' },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('tool');
      expect(result[1].role).toBe('tool');
    });

    it('should combine text blocks in assistant messages', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Line 1' },
            { type: 'text', text: 'Line 2' },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'assistant', content: 'Line 1\nLine 2' });
    });

    it('should handle empty tool results content', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1' }],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call_1',
        content: '',
      });
    });

    it('should handle empty input in tool_use', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'test' }],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      const msgWithToolCalls = result[0] as { tool_calls?: Array<{ function: { arguments: string } }> };
      expect(msgWithToolCalls.tool_calls?.[0].function.arguments).toBe('{}');
    });

    it('should handle messages with only text blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Simple response' }],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'assistant', content: 'Simple response' });
    });
  });
});
