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
  return (async function* () {
    for (const e of events) {
      yield e;
    }
  })();
}

// ── Mock LLMClient (provider-agnostic) ────────
const mockStream = vi.fn();
const mockClient: LLMClient = { stream: mockStream };

// Mock only createLLMClient — keep rest of module real.
// Use doMock + dontMock to avoid TS import confusion: inline the mock.
vi.mock('./LLMClient.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./LLMClient.js')>();
  return {
    ...mod,
    createLLMClient: vi.fn(() => mockClient),
  };
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
      mockToolExecute.mockImplementation(async (args: Record<string, unknown>) => {
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

      const errorCalls = onToolResult.mock.calls.filter(
        ([, , isError]: [string, string, boolean]) => isError === true,
      );
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
});
