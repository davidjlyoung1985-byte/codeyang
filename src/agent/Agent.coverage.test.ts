/**
 * Agent.ts core-path coverage suite.
 *
 * Companion to Agent.test.ts. Target: exercise the branches Agent.test.ts does
 * NOT touch — the public status accessors, checkpoint/state helpers, and the
 * run-loop wiring (gateway rejection, planner prompt, verification pipeline,
 * watcher, anti-repetition guards, malformed tool args, self-critique).
 *
 * Mocks mirror Agent.test.ts so behaviour stays comparable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────
vi.mock('./config.js', () => ({
  config: {
    model: 'test-model',
    apiKey: 'test-key-12345',
    maxTokens: 8192,
    maxRetries: 3,
    maxTurns: 20,
    temperature: 0.5,
    autoVerify: false,
    autoFixOnError: false,
    watchMode: false,
    reflexion: { enabled: false, failureThreshold: 2, maxReflections: 50, autoInject: true },
    planner: { enabled: false, autoDetect: true, complexityThreshold: 3, requireApproval: true, maxRetries: 2 },
    getSystemPrompt: vi.fn(() => 'You are a test agent.'),
  },
}));

const mockToolExecute = vi.fn();

vi.mock('../tools/registry.js', () => ({
  toolSchemas: vi.fn(() => [
    {
      name: 'Bash',
      description: 'Execute a command',
      input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  ]),
  getTool: vi.fn((name: string) =>
    name === 'Bash' || name === 'Write' || name === 'Edit'
      ? { name, description: 'mock', parameters: { type: 'object', properties: {} }, execute: mockToolExecute }
      : undefined,
  ),
  setToolContext: vi.fn(),
  refreshMcpTools: vi.fn(),
}));

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
function makeStream(...events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return (function* () {
    for (const e of events) yield e;
  })();
}

const mockStream = vi.fn();
const mockChat = vi.fn();
const mockClient: LLMClient = { stream: mockStream, chat: mockChat };

vi.mock('./LLMClient.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./LLMClient.js')>();
  return { ...mod, createLLMClient: vi.fn(() => mockClient) };
});

vi.mock('../gateway/index.js', () => {
  const mockGateway = {
    createRequest: vi.fn((opts: Record<string, unknown>) => ({ ...opts, source: 'internal' })),
    handle: vi.fn().mockResolvedValue({ success: true, data: null }),
    getAuditLogger: vi.fn(() => ({
      log: vi.fn(),
      getEntries: vi.fn(() => []),
      getStats: vi.fn(() => ({ agent_run: { total: 3, failed: 0, avgMs: 5 } })),
    })),
    getCircuitBreaker: vi.fn(() => ({ isOpen: vi.fn(() => false), recordSuccess: vi.fn(), recordFailure: vi.fn() })),
  };
  return { Gateway: { getInstance: vi.fn(() => mockGateway) } };
});

import { Agent } from './Agent.js';
import { config } from './config.js';
import { Gateway } from '../gateway/index.js';

const gateway = Gateway.getInstance() as unknown as { handle: ReturnType<typeof vi.fn> };

// Length-safe text used by anti-repetition checks.
const LONG = 'The quick brown fox jumps over the lazy dog and keeps running onward.';

describe('Agent core-path coverage', () => {
  let agent: Agent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockToolExecute.mockResolvedValue('tool output ok');
    mockChat.mockResolvedValue({ content: '{}' });
    mockStream.mockReturnValue(makeStream());
    gateway.handle.mockResolvedValue({ success: true, data: null });
    // Reset config flags to the quiet defaults between tests.
    config.autoVerify = false;
    config.autoFixOnError = false;
    config.planner.enabled = false;
    config.reflexion.enabled = false;
    agent = new Agent();
  });

  // ── Public status accessors ────────────────────────────────────────────
  describe('accessors', () => {
    it('exposes the wired collaborators', () => {
      expect(agent.getLLMClient()).toBeDefined();
      expect(agent.getReflexionEngine()).toBeDefined();
      expect(agent.getPlanner()).toBeDefined();
      expect(agent.getTracer()).toBeDefined();
      expect(agent.getCircuitBreakerManager()).toBeDefined();
      expect(agent.getGateway()).toBeDefined();
    });

    it('reports an empty trace id before running', () => {
      expect(agent.getCurrentTraceId()).toBe('');
    });

    it('reports harness status with tracing/circuit-breaker/gateway sections', () => {
      const status = agent.getHarnessStatus();
      expect(status).toHaveProperty('tracing');
      expect(status).toHaveProperty('circuitBreakers');
      expect(status).toHaveProperty('gateway');
      expect((status.gateway as { operations: number }).operations).toBe(1);
    });

    it('reports closed-loop status with planner and rl-weights sections', async () => {
      const { recordToolOutcome } = await import('../tools/rl-weighter.js');
      await recordToolOutcome('Bash', true, 12);
      await recordToolOutcome('Bash', false, 30);
      const status = agent.getClosedLoopStatus();
      expect(status).toHaveProperty('autoVerify');
      expect(status).toHaveProperty('reflexion');
      expect(status).toHaveProperty('planner');
      expect(status).toHaveProperty('rlWeights');
      const rl = status.rlWeights as { topPerformingTools: unknown[] };
      expect(Array.isArray(rl.topPerformingTools)).toBe(true);
    });

    it('reports no pending feedback and false harness status when audit throws', () => {
      expect(agent.pendingFeedback).toBe(false);
    });
  });

  // ── Checkpoints / misc state ───────────────────────────────────────────
  describe('checkpoint & state helpers', () => {
    it('saves and restores a checkpoint', () => {
      expect(agent.checkpointCount).toBe(0);
      const idx = agent.saveCheckpoint();
      expect(idx).toBe(0);
      expect(agent.checkpointCount).toBe(1);
      expect(agent.restoreCheckpoint()).toBe(true);
    });

    it('restoreCheckpoint returns false when there are none', () => {
      expect(agent.restoreCheckpoint()).toBe(false);
    });

    it('records and reads tool stats', () => {
      agent.recordToolCall('Bash', 42, false);
      agent.recordToolCall('Bash', 8, true);
      const stats = agent.getToolStats().get('Bash');
      expect(stats?.calls).toBe(2);
      expect(stats?.errors).toBe(1);
    });

    it('is a no-op to cancel tools / stop thinking when idle', () => {
      expect(agent.isThinking).toBe(false);
      agent.cancelRunningTools();
      agent.stopThinking();
      expect(agent.isThinking).toBe(false);
    });

    it('answerQuestion is safe without a pending question', () => {
      expect(() => agent.answerQuestion('nope')).not.toThrow();
      expect(agent.waitingForAnswer).toBe(false);
    });
  });

  // ── run() wiring ───────────────────────────────────────────────────────
  describe('run() wiring', () => {
    it('throws when the gateway rejects the request', async () => {
      gateway.handle.mockResolvedValueOnce({ success: false, error: 'denied' });
      await expect(agent.run('hello')).rejects.toThrow('[Gateway] denied');
    });

    it('injects a planner prompt when the planner is enabled', async () => {
      config.planner.enabled = true;
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({
          steps: [
            { id: 's1', description: 'do the thing', tools: [], dependencies: [] },
            { id: 's2', description: 'verify', tools: [], dependencies: ['s1'] },
          ],
        }),
      });
      // Turn 1: no tool calls -> loop ends after planning.
      mockStream.mockReturnValue(makeStream(textDelta('done')));
      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('a complex multi-step task that should trigger planning and more');
      expect(onToolResult.mock.calls.some(([name]) => name === 'Planner')).toBe(true);
    });

    it('tolerates malformed tool-call JSON', async () => {
      let i = 0;
      mockStream.mockImplementation(() => {
        i++;
        return i === 1
          ? makeStream(
              toolCallStart(0, 'tc_bad', 'Bash'),
              toolCallDelta(0, '{not valid json'),
              toolCallEnd(0, 'tc_bad', '{not valid json'),
            )
          : makeStream(textDelta('recovered'));
      });
      await expect(agent.run('do it')).resolves.toBeUndefined();
    });

    it('runs the auto-verify pipeline for written files', async () => {
      config.autoVerify = true;
      const pipeline = {
        run: vi.fn(async () => [{ tool: 'eslint', passed: true, output: '' }]),
        verifyWithFix: vi.fn(async () => ({ results: [{ tool: 'eslint', passed: true, output: '' }] })),
        formatSummary: vi.fn(() => 'eslint passed'),
      };
      agent.setVerificationPipeline(pipeline as never);

      let i = 0;
      mockStream.mockImplementation(() => {
        i++;
        return i === 1
          ? makeStream(
              toolCallStart(0, 'tc_w', 'Write'),
              toolCallDelta(0, '{"filePath":"a.ts","content":"x"}'),
              toolCallEnd(0, 'tc_w', '{"filePath":"a.ts","content":"x"}'),
            )
          : makeStream(textDelta('done'));
      });

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('write it');
      expect(pipeline.run).toHaveBeenCalledWith('a.ts');
      expect(onToolResult.mock.calls.some(([name]) => name === 'Auto-Verify')).toBe(true);
    });

    it('notifies the watcher after tool calls', async () => {
      const watcher = { checkPostTool: vi.fn() };
      agent.setWatcher(watcher as never);

      let i = 0;
      mockStream.mockImplementation(() => {
        i++;
        return i === 1
          ? makeStream(
              toolCallStart(0, 'tc_w', 'Write'),
              toolCallDelta(0, '{"filePath":"b.ts","content":"y"}'),
              toolCallEnd(0, 'tc_w', '{"filePath":"b.ts","content":"y"}'),
            )
          : makeStream(textDelta('done'));
      });
      await agent.run('write it');
      expect(watcher.checkPostTool).toHaveBeenCalled();
    });

    it('stops on an exact-repeat loop and cancels pending tools', async () => {
      mockStream.mockReturnValue(makeStream(textDelta(LONG)));
      await agent.run('one');
      await agent.run('two');
      await agent.run('three'); // repeatCount reaches 2 -> break
      expect(mockStream.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('stops on a similar (fuzzy) repeat', async () => {
      const shared = 'z'.repeat(120);
      mockStream.mockReturnValueOnce(makeStream(textDelta(shared + ' A')));
      mockStream.mockReturnValueOnce(makeStream(textDelta(shared + ' B')));
      mockStream.mockReturnValueOnce(makeStream(textDelta(shared + ' C')));
      await agent.run('one');
      await agent.run('two');
      await agent.run('three');
      expect(mockStream.mock.calls.length).toBe(3);
    });

    it('cancels pending tools when an exact repeat is detected mid-loop', async () => {
      // Each stream emits the same long text; run #2's first turn repeats run #1's
      // last text while a tool call is pending -> pushCancelledToolResults fires.
      const withTool = (id: string) =>
        makeStream(
          textDelta(LONG),
          toolCallStart(0, id, 'Bash'),
          toolCallDelta(0, '{"command":"echo x"}'),
          toolCallEnd(0, id, '{"command":"echo x"}'),
        );
      mockStream
        .mockReturnValueOnce(withTool('tc1')) // run1 turn1
        .mockReturnValueOnce(makeStream(textDelta(LONG))) // run1 turn2 (no tools -> break)
        .mockReturnValueOnce(withTool('tc2')); // run2 turn1 -> exact repeat + pending tool
      await agent.run('one');
      await agent.run('two');
      expect(mockToolExecute).toHaveBeenCalledTimes(1);
    });

    it('auto-verify with autoFixOnError surfaces failures back to the agent', async () => {
      config.autoVerify = true;
      config.autoFixOnError = true;
      const failed = [{ tool: 'tsc', passed: false, output: 'type error' }];
      const pipeline = {
        run: vi.fn(async () => failed),
        verifyWithFix: vi.fn(async () => ({ results: failed })),
        formatSummary: vi.fn(() => 'tsc failed'),
      };
      agent.setVerificationPipeline(pipeline as never);

      let i = 0;
      mockStream.mockImplementation(() => {
        i++;
        return i === 1
          ? makeStream(
              toolCallStart(0, 'tc_w', 'Edit'),
              toolCallDelta(0, '{"filePath":"c.ts","oldString":"a","newString":"b"}'),
              toolCallEnd(0, 'tc_w', '{"filePath":"c.ts","oldString":"a","newString":"b"}'),
            )
          : makeStream(textDelta('done'));
      });
      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('edit it');
      expect(pipeline.verifyWithFix).toHaveBeenCalledWith('c.ts');
      const verifyCall = onToolResult.mock.calls.find(([name]) => name === 'Auto-Verify');
      expect(verifyCall?.[2]).toBe(true); // isError === true on failure
    });

    it('triggers reflexion after consecutive failures', async () => {
      config.reflexion.enabled = true;
      const eng = agent.getReflexionEngine();
      eng.recordExecution({ task: 't', toolCalls: [], results: [], success: false, durationMs: 1 });
      eng.recordExecution({ task: 't', toolCalls: [], results: [], success: false, durationMs: 1 });
      mockChat.mockResolvedValue({
        content: JSON.stringify({ analysis: 'kept failing', patterns: ['p1'], recommendations: ['r1'] }),
      });

      let i = 0;
      mockStream.mockImplementation(() => {
        i++;
        return i === 1
          ? makeStream(
              toolCallStart(0, 'tc_b', 'Bash'),
              toolCallDelta(0, '{"command":"echo z"}'),
              toolCallEnd(0, 'tc_b', '{"command":"echo z"}'),
            )
          : makeStream(textDelta('done'));
      });
      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('do it');
      expect(onToolResult.mock.calls.some(([name]) => name === 'Reflexion')).toBe(true);
    });

    it('runs self-critique on assistant output containing code', async () => {
      const critiqueJson = JSON.stringify({
        score: 40,
        summary: 'needs work',
        issues: [{ category: 'bug', severity: 'critical', description: 'broken', suggestion: 'fix it' }],
      });
      let i = 0;
      mockStream.mockImplementation(() => {
        i++;
        if (i === 1) {
          return makeStream(
            textDelta('Here is code:\n```js\nfunction add(a, b) { return a + b; }\nconsole.log(add(1, 2));\n```'),
            toolCallStart(0, 'tc_w', 'Write'),
            toolCallDelta(0, '{"filePath":"d.ts","content":"x"}'),
            toolCallEnd(0, 'tc_w', '{"filePath":"d.ts","content":"x"}'),
          );
        }
        if (i === 2) return makeStream(textDelta(critiqueJson)); // critique consumeStream
        return makeStream(textDelta('done'));
      });
      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('write code');
      expect(onToolResult.mock.calls.some(([name]) => name === 'Self-Critique')).toBe(true);
    });
  });
});
