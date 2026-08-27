import { describe, it, expect } from 'vitest';
import { convertToAnthropicMessages, convertToAnthropicTools, convertToOpenAIMessages } from './conversion-fns.js';
import type { LLMMessage, ToolSchema } from './LLMClient.js';

describe('conversion-fns', () => {
  describe('convertToAnthropicMessages', () => {
    it('converts simple string messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    });

    it('converts text block messages', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      });
    });

    it('converts tool_use blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'read_file',
              input: { path: '/test.txt' },
            },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'read_file',
            input: { path: '/test.txt' },
          },
        ],
      });
    });

    it('converts tool_result blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_123',
              content: 'File content here',
            },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool_123',
            content: 'File content here',
          },
        ],
      });
    });

    it('handles mixed content blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read that file' },
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'read_file',
              input: { path: '/test.txt' },
            },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toHaveLength(2);
    });

    it('handles empty text blocks', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: [{ type: 'text', text: '' }],
      });
    });

    it('handles unknown block types', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [{ type: 'unknown_type' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: [{ type: 'text', text: '' }],
      });
    });

    it('handles empty input in tool_use', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'some_tool',
            },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);

      expect(result[0].content[0]).toMatchObject({
        type: 'tool_use',
        input: {},
      });
    });
  });

  describe('convertToAnthropicTools', () => {
    it('converts tool schemas', () => {
      const tools: ToolSchema[] = [
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
      ];

      const result = convertToAnthropicTools(tools);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'read_file',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      });
    });

    it('converts multiple tools', () => {
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

    it('handles empty tools array', () => {
      const result = convertToAnthropicTools([]);

      expect(result).toEqual([]);
    });
  });

  describe('convertToOpenAIMessages', () => {
    it('converts simple string messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    });

    it('converts text blocks to string content', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello\nWorld' });
    });

    it('converts assistant tool_use to tool_calls', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_123',
              name: 'read_file',
              input: { path: '/test.txt' },
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"/test.txt"}',
            },
          },
        ],
      });
    });

    it('converts tool_result to tool role messages', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_123',
              content: 'File content',
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call_123',
        content: 'File content',
      });
    });

    it('handles multiple tool_results', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              content: 'Result 1',
            },
            {
              type: 'tool_result',
              tool_use_id: 'call_2',
              content: 'Result 2',
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('tool');
      expect(result[1].role).toBe('tool');
    });

    it('adds user message after tool_results if text exists', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_123',
              content: 'Result',
            },
            { type: 'text', text: 'Follow-up question' },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call_123',
        content: 'Result',
      });
      expect(result[1]).toEqual({
        role: 'user',
        content: 'Follow-up question',
      });
    });

    it('handles assistant message with text and tool_calls', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check that' },
            {
              type: 'tool_use',
              id: 'call_123',
              name: 'read_file',
              input: { path: '/test.txt' },
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        role: 'assistant',
        content: 'Let me check that',
        tool_calls: expect.any(Array),
      });
    });

    it('handles empty tool_result content', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_123',
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call_123',
        content: '',
      });
    });

    it('handles empty messages array', () => {
      const result = convertToOpenAIMessages([]);

      expect(result).toEqual([]);
    });

    it('handles missing input in tool_use', () => {
      const messages: LLMMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_123',
              name: 'some_tool',
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);

      expect(result[0].tool_calls[0].function.arguments).toBe('{}');
    });
  });
});
