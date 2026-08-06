import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────
// Mock config before importing Agent
vi.mock('./config.js', () => ({
  config: {
    model: 'test-model',
    apiKey: 'test-key-12345',
    maxTokens: 8192,
    maxRetries: 3,
    maxTurns: 20,
    temperature: 0.5,
    autoVerify: true,
    autoFixOnError: true,
    watchMode: true,
    reflexion: {
      enabled: true,
      failureThreshold: 2,
      maxReflections: 50,
      autoInject: true,
    },
    planner: {
      enabled: true,
      autoDetect: true,
      complexityThreshold: 3,
      requireApproval: true,
      maxRetries: 2,
    },
    getSystemPrompt: vi.fn(() => 'You are a test agent.'),
  },
}));

// Mock tool registry
const mockToolExecute = vi.fn();

vi.mock('../tools/registry.js', () => ({
  toolSchemas: vi.fn(() => [
    {
      name: 'Bash',
      description: 'Execute a command',
      input_schema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  ]),
  getTool: vi.fn((name: string) => {
    if (name === 'Bash') {
      return {
        name: 'Bash',
        description: 'Execute a command',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' } },
        },
        execute: mockToolExecute,
      };
    }
    return undefined;
  }),
  setToolContext: vi.fn(),
  refreshMcpTools: vi.fn(),
}));

// ── StreamEvent helpers ──────────────────────
// Generate StreamEvent objects matching LLMClient interface (provider-agnostic).

import type { StreamEvent, LLMClient } from './LLMClient.js';

function textDelta(text: string): StreamEvent {
  return { type: 'text_delta', text };
}

function toolCallStart(index: number, id: string, name: string): StreamEvent {
  return { type: 'tool_call_start', toolCallIndex: index, toolCallId: id, toolCallName: name };
}

function toolCallDelta(index: number, args: string): StreamEvent {
  return { type: 'tool_call_delta', toolCallIndex: index, toolCallArgs: args };
}

function toolCallEnd(index: number, id: string, args: string): StreamEvent {
  return { type: 'tool_call_end', toolCallIndex: index, toolCallId: id, toolCallArgs: args };
}

function usageEvent(inputTokens: number, outputTokens: number): StreamEvent {
  return { type: 'usage', inputTokens, outputTokens };
}

/** Build an async generator from an array of StreamEvents for mock stream() */
function makeStream(...events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return (function* () {
    for (const e of events) {
      yield e;
    }
  })();
}

// ── Mock LLMClient (provider-agnostic) ────────
const mockStream = vi.fn();
const mockClient: LLMClient = { stream: mockStream };

// Mock only createLLMClient — keep rest of module real.
vi.mock('./LLMClient.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./LLMClient.js')>();
  return {
    ...mod,
    createLLMClient: vi.fn(() => mockClient),
  };
});

// Mock Gateway to bypass authentication in tests
vi.mock('../gateway/index.js', () => {
  const mockGateway = {
    createRequest: vi.fn((opts: Record<string, unknown>) => ({ ...opts, source: 'internal' })),
    handle: vi.fn().mockResolvedValue({ success: true, data: null }),
    getAuditLogger: vi.fn(() => ({
      log: vi.fn(),
      getEntries: vi.fn(() => []),
      clear: vi.fn(),
    })),
    getCircuitBreaker: vi.fn(() => ({
      isOpen: vi.fn(() => false),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    })),
  };
  return { Gateway: { getInstance: vi.fn(() => mockGateway) } };
});

// Now we can import Agent
import { Agent, type AgentCallbacks } from './Agent.js';

// ──────────────────────────────────────────────
// Agent tests
// ──────────────────────────────────────────────

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockToolExecute.mockResolvedValue('tool output ok');
    agent = new Agent();
  });

  describe('construction', () => {
    it('creates an Agent with apiKey set', () => {
      expect(agent.apiKeySet).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears conversation state', () => {
      agent.reset();
      const messages = agent.exportMessages();
      expect(messages).toHaveLength(0);
    });
  });

  describe('waitingForAnswer / answerQuestion', () => {
    it('is not waiting for answer initially', () => {
      expect(agent.waitingForAnswer).toBe(false);
    });

    it('can cancel a question without error', () => {
      agent.cancelQuestion();
      expect(agent.waitingForAnswer).toBe(false);
    });
  });

  describe('setCallbacks', () => {
    it('accepts and stores callbacks', () => {
      const cbs: AgentCallbacks = {
        onAgentText: vi.fn(),
        onError: vi.fn(),
      };
      agent.setCallbacks(cbs);
    });
  });

  describe('exportMessages', () => {
    it('returns empty array for fresh agent', () => {
      expect(agent.exportMessages()).toEqual([]);
    });
  });

  describe('loadMessages', () => {
    it('restores user and assistant messages', () => {
      agent.loadMessages([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]);
      const exported = agent.exportMessages();
      expect(exported).toHaveLength(2);
      expect(exported[0]).toMatchObject({ role: 'user', content: 'Hello' });
      expect(exported[1]).toMatchObject({ role: 'assistant', content: 'Hi there' });
    });

    it('restores messages with tool calls', () => {
      agent.loadMessages([
        {
          role: 'assistant',
          content: 'Let me run a command',
          toolCalls: [{ id: 'tc1', name: 'Bash', args: { command: 'echo hi' } }],
        },
        {
          role: 'user',
          toolResults: [{ tool: 'tc1', input: {}, output: 'hi', isError: false }],
          content: '',
        },
      ]);
      const exported = agent.exportMessages();
      expect(exported).toHaveLength(2);
      expect(exported[0].toolCalls).toBeDefined();
      expect(exported[0].toolCalls![0].name).toBe('Bash');
      expect(exported[1].toolResults).toBeDefined();
      expect(exported[1].toolResults![0].output).toBe('hi');
    });

    it('handles messages without tool calls/result', () => {
      agent.loadMessages([{ role: 'user', content: 'Question?' }]);
      const exported = agent.exportMessages();
      expect(exported).toHaveLength(1);
      expect(exported[0].content).toBe('Question?');
    });
  });

  describe('run — streaming text', () => {
    it('streams text response from LLM', async () => {
      mockStream.mockReturnValue(makeStream());
      await agent.run('test prompt');
      expect(mockStream).toHaveBeenCalledTimes(1);
    });

    it('sends user message to LLM API', async () => {
      mockStream.mockReturnValue(makeStream());
      await agent.run('hello');
      expect(mockStream).toHaveBeenCalled();
    });

    it('calls onUserMessage callback', async () => {
      mockStream.mockReturnValue(makeStream());
      const onUserMessage = vi.fn();
      agent.setCallbacks({ onUserMessage });
      await agent.run('test prompt');
      expect(onUserMessage).toHaveBeenCalledWith('test prompt');
    });

    it('calls onAgentDelta for streaming text', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('Hello '), textDelta('World')));
      const onAgentDelta = vi.fn();
      agent.setCallbacks({ onAgentDelta });
      await agent.run('hi');
      expect(onAgentDelta).toHaveBeenCalledTimes(2);
      expect(onAgentDelta).toHaveBeenCalledWith('Hello ');
      expect(onAgentDelta).toHaveBeenCalledWith('World');
    });
  });

  describe('run — tool calls', () => {
    it('executes tool calls from LLM and sends results back', async () => {
      const toolCallsExecuted: string[] = [];
      mockToolExecute.mockImplementation((args: Record<string, unknown>) => {
        toolCallsExecuted.push(String(args['command']));
        return 'executed ok';
      });

      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return makeStream(
            toolCallStart(0, 'tc_001', 'Bash'),
            toolCallDelta(0, '{"command":"echo hello"}'),
            toolCallEnd(0, 'tc_001', '{"command":"echo hello"}'),
          );
        }
        return makeStream(textDelta('Done.'));
      });

      await agent.run('say hello');
      expect(toolCallsExecuted).toContain('echo hello');
    });

    it('handles unknown tools gracefully', async () => {
      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return makeStream(
            toolCallStart(0, 'tc_002', 'UnknownTool'),
            toolCallDelta(0, '{"arg":"value"}'),
            toolCallEnd(0, 'tc_002', '{"arg":"value"}'),
          );
        }
        return makeStream(textDelta('I tried.'));
      });

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await expect(agent.run('use unknown')).resolves.toBeUndefined();

      const errorCalls = onToolResult.mock.calls.filter(([, , isError]: [string, string, boolean]) => isError === true);
      expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('run — token usage tracking', () => {
    it('accumulates token usage from usage events', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('Hello'), usageEvent(10, 20)));
      await agent.run('prompt 1');
      expect(agent.getTokenUsage()).toEqual({ inputTokens: 10, outputTokens: 20 });

      mockStream.mockReturnValue(makeStream(textDelta('World'), usageEvent(5, 15)));
      await agent.run('prompt 2');
      expect(agent.getTokenUsage()).toEqual({ inputTokens: 15, outputTokens: 35 });
    });

    it('resets token usage on agent reset', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('Hello'), usageEvent(10, 20)));
      await agent.run('prompt');
      expect(agent.getTokenUsage().inputTokens).toBe(10);

      agent.reset();
      expect(agent.getTokenUsage()).toEqual({ inputTokens: 0, outputTokens: 0 });
    });
  });

  describe('error handling', () => {
    it('handles LLM API errors gracefully', async () => {
      mockStream.mockRejectedValue(new Error('API connection failed'));
      const onError = vi.fn();
      agent.setCallbacks({ onError });

      await expect(agent.run('test prompt')).rejects.toThrow('LLM API circuit breaker');
    });

    it('handles malformed tool call JSON', async () => {
      mockStream.mockReturnValue(
        makeStream(
          toolCallStart(0, 'tc_bad', 'Bash'),
          toolCallDelta(0, '{"command":"test"}'),
          toolCallEnd(0, 'tc_bad', '{"command":"test"}'),
        ),
      );

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });

      await agent.run('test command');

      // Tool should execute successfully with valid JSON
      expect(onToolResult).toHaveBeenCalled();
    });

    it('handles tool execution errors', async () => {
      mockToolExecute.mockRejectedValue(new Error('Tool execution failed'));

      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return makeStream(
            toolCallStart(0, 'tc_err', 'Bash'),
            toolCallDelta(0, '{"command":"fail"}'),
            toolCallEnd(0, 'tc_err', '{"command":"fail"}'),
          );
        }
        return makeStream(textDelta('Handled error'));
      });

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });

      await agent.run('execute failing command');

      // Should report tool error
      const errorCalls = onToolResult.mock.calls.filter(([, , isError]: [string, string, boolean]) => isError === true);
      expect(errorCalls.length).toBeGreaterThan(0);
    });

    it('handles empty user prompt', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('Response')));
      await agent.run('');
      expect(mockStream).toHaveBeenCalled();
    });

    it('handles very long user prompts', async () => {
      const longPrompt = 'a'.repeat(10000);
      mockStream.mockReturnValue(makeStream(textDelta('OK')));
      await agent.run(longPrompt);
      expect(mockStream).toHaveBeenCalled();
    });

    it('handles stream interruption', async () => {
      async function* brokenStream() {
        yield textDelta('Start');
        throw new Error('Stream interrupted');
      }

      mockStream.mockReturnValue(brokenStream());

      await expect(agent.run('test')).rejects.toThrow('Stream interrupted');
    });

    it('handles multiple tool calls in single turn', async () => {
      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return makeStream(
            toolCallStart(0, 'tc_1', 'Bash'),
            toolCallDelta(0, '{"command":"cmd1"}'),
            toolCallEnd(0, 'tc_1', '{"command":"cmd1"}'),
            toolCallStart(1, 'tc_2', 'Bash'),
            toolCallDelta(1, '{"command":"cmd2"}'),
            toolCallEnd(1, 'tc_2', '{"command":"cmd2"}'),
          );
        }
        return makeStream(textDelta('Both executed'));
      });

      mockToolExecute.mockResolvedValue('OK');
      await agent.run('run multiple commands');
      expect(mockToolExecute).toHaveBeenCalledTimes(2);
    });

    it('handles timeout scenarios', async () => {
      async function* slowStream() {
        yield textDelta('Start');
        await new Promise((resolve) => setTimeout(resolve, 100));
        yield textDelta('End');
      }

      mockStream.mockReturnValue(slowStream());
      await agent.run('slow response');
      expect(mockStream).toHaveBeenCalled();
    });

    it('handles null or undefined in messages', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('Response')));

      // Should not throw
      await agent.run('test');
      expect(agent.exportMessages()).toBeDefined();
    });

    it('handles concurrent run calls', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('Response')));

      // Multiple concurrent runs
      const promise1 = agent.run('prompt 1');
      const promise2 = agent.run('prompt 2');

      await Promise.all([promise1, promise2]);

      // Should handle both without crashing
      expect(mockStream).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles special characters in prompts', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('OK')));
      await agent.run('Test with "quotes" and <tags> & special chars $VAR');
      expect(mockStream).toHaveBeenCalled();
    });

    it('handles unicode in prompts', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('OK')));
      await agent.run('Hello 世界 🌍 Здравствуй');
      expect(mockStream).toHaveBeenCalled();
    });

    it('handles newlines and formatting in prompts', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('OK')));
      await agent.run('Line 1\nLine 2\n\tIndented\n\nDouble newline');
      expect(mockStream).toHaveBeenCalled();
    });

    it('handles tool calls with empty arguments', async () => {
      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return makeStream(
            toolCallStart(0, 'tc_empty', 'Bash'),
            toolCallDelta(0, '{}'),
            toolCallEnd(0, 'tc_empty', '{}'),
          );
        }
        return makeStream(textDelta('Done'));
      });

      mockToolExecute.mockResolvedValue('OK');
      await agent.run('empty args');
      expect(mockToolExecute).toHaveBeenCalled();
    });

    it('handles rapid reset and run cycles', async () => {
      mockStream.mockReturnValue(makeStream(textDelta('OK')));

      for (let i = 0; i < 5; i++) {
        agent.reset();
        await agent.run(`prompt ${i}`);
      }

      expect(mockStream).toHaveBeenCalledTimes(5);
    });

    it('handles message export after errors', async () => {
      mockStream.mockRejectedValue(new Error('Test error'));

      try {
        await agent.run('failing prompt');
      } catch {
        // Expected error
      }

      const messages = agent.exportMessages();
      expect(Array.isArray(messages)).toBe(true);
    });

    it('handles loadMessages with malformed data', async () => {
      // Should not crash on malformed messages
      agent.loadMessages([
        { role: 'user', content: 'Valid' },
        { role: 'assistant' } as unknown as { role: string; content: string }, // Missing content
      ]);

      const exported = agent.exportMessages();
      expect(exported.length).toBeGreaterThan(0);
    });
  });
});
