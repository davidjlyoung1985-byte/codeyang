import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────
// Mock config before importing Agent
vi.mock('./config.js', () => ({
  config: {
    model: 'claude-sonnet-4-20250514',
    apiKey: 'test-key-12345',
    maxTokens: 8192,
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

// Helpers for creating stream events
function createTextDelta(text: string) {
  return { type: 'content_block_delta', delta: { type: 'text_delta', text } };
}

function createToolStart(index: number, id: string, name: string) {
  return {
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', id, name },
  };
}

function createToolJsonDelta(index: number, json: string) {
  return { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json } };
}

function createBlockStop(index: number) {
  return { type: 'content_block_stop', index };
}

// Mock Anthropic SDK — must use function() for constructor support
const mockStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: function Anthropic(_opts: Record<string, unknown>) {
    return {
      messages: {
        stream: mockStream,
        create: vi.fn(),
      },
    };
  },
}));

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
      // After reset, exportMessages should be empty
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
      // Not directly testable without running, but shouldn't throw
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
    it('streams text response from Claude', async () => {
      mockStream.mockReturnValue(
        (async function* () {
          yield createBlockStop(0);
        })(),
      );

      await agent.run('test prompt');

      expect(mockStream).toHaveBeenCalledTimes(1);
    });

    it('sends user message to Claude API', async () => {
      mockStream.mockReturnValue(
        (async function* () {
          yield createBlockStop(0);
        })(),
      );

      await agent.run('hello');
      expect(mockStream).toHaveBeenCalled();
    });

    it('calls onUserMessage callback', async () => {
      mockStream.mockReturnValue(
        (async function* () {
          yield createBlockStop(0);
        })(),
      );

      const onUserMessage = vi.fn();
      agent.setCallbacks({ onUserMessage });

      await agent.run('test prompt');

      expect(onUserMessage).toHaveBeenCalledWith('test prompt');
    });

    it('calls onAgentDelta for streaming text', async () => {
      mockStream.mockReturnValue(
        (async function* () {
          yield createTextDelta('Hello ');
          yield createTextDelta('World');
          yield createBlockStop(0);
        })(),
      );

      const onAgentDelta = vi.fn();
      agent.setCallbacks({ onAgentDelta });

      await agent.run('hi');

      expect(onAgentDelta).toHaveBeenCalledTimes(2);
      expect(onAgentDelta).toHaveBeenCalledWith('Hello ');
      expect(onAgentDelta).toHaveBeenCalledWith('World');
    });
  });

  describe('run — tool calls', () => {
    it('executes tool calls from Claude and sends results back', async () => {
      const toolCallsExecuted: string[] = [];

      mockToolExecute.mockImplementation(async (args: Record<string, unknown>) => {
        toolCallsExecuted.push(String(args['command']));
        return 'executed ok';
      });

      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        return (async function* () {
          if (callIndex === 1) {
            yield createToolStart(0, 'tc_001', 'Bash');
            yield createToolJsonDelta(0, '{"command":"echo hello"}');
            yield createBlockStop(0);
          } else {
            yield createTextDelta('Done.');
            yield createBlockStop(0);
          }
        })();
      });

      await agent.run('say hello');

      expect(toolCallsExecuted).toContain('echo hello');
    });

    it('handles unknown tools gracefully', async () => {
      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        return (async function* () {
          if (callIndex === 1) {
            yield createToolStart(0, 'tc_002', 'UnknownTool');
            yield createToolJsonDelta(0, '{"arg":"value"}');
            yield createBlockStop(0);
          } else {
            yield createTextDelta('I tried.');
            yield createBlockStop(0);
          }
        })();
      });

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });

      await expect(agent.run('use unknown')).resolves.toBeUndefined();

      // Should report the unknown tool error
      const errorCalls = onToolResult.mock.calls.filter(([, , isError]: [string, string, boolean]) => isError === true);
      expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
