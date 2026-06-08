import { describe, it, expect, vi } from 'vitest';

// ── Mocks ────────────────────────────────────
// vi.mock is hoisted to top, so mock values must use vi.hoisted()
const mockConsumeStream = vi.hoisted(() => vi.fn());

vi.mock('../agent/LLMClient.js', () => ({
  consumeStream: mockConsumeStream,
}));

vi.mock('./registry.js', () => ({
  toolSchemas: vi.fn(() => [
    { name: 'Bash', description: 'Run a command', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
  ]),
  getTool: vi.fn((name: string) => {
    if (name === 'Bash') {
      return {
        name: 'Bash',
        execute: vi.fn(async (args: Record<string, unknown>) => `executed: ${args['command']}`),
        parameters: {},
      };
    }
    return undefined;
  }),
}));

import { executeTask } from './TaskTool.js';

// ── Tests ────────────────────────────────────
describe('TaskTool', () => {
  const mockClient = { stream: vi.fn() };
  const model = 'test-model';
  const maxTokens = 4096;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a single subtask and returns text response', async () => {
    mockConsumeStream.mockResolvedValueOnce({ text: 'Here is the result.', toolCalls: [] });

    const result = await executeTask(mockClient as any, model, maxTokens, 'test task', ['do something'], '/tmp');

    expect(result).toContain('Here is the result.');
    expect(mockConsumeStream).toHaveBeenCalledTimes(1);
  });

  it('executes tool calls and sends results back', async () => {
    mockConsumeStream
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc1', name: 'Bash', input: { command: 'echo hello' } }],
      })
      .mockResolvedValueOnce({ text: 'Done.', toolCalls: [] });

    const result = await executeTask(mockClient as any, model, maxTokens, 'run bash', ['run a command'], '/tmp');

    expect(result).toContain('Done.');
    expect(mockConsumeStream).toHaveBeenCalledTimes(2);
  });

  it('blocks Question and Task tools in sub-agents, continues on next turn', async () => {
    mockConsumeStream
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc_q', name: 'Question', input: { question: 'Are you sure?' } }],
      })
      .mockResolvedValueOnce({ text: 'Finished.', toolCalls: [] });

    const result = await executeTask(mockClient as any, model, maxTokens, 'ask question', ['ask me'], '/tmp');

    // Question is blocked internally as tool_result; agent gets "Finished" on next turn
    expect(result).toContain('Finished.');
    // Two turns: one with Question tool, one with final text
    expect(mockConsumeStream).toHaveBeenCalledTimes(2);
  });

  it('handles unknown tools gracefully — marks error and continues', async () => {
    mockConsumeStream
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc_u', name: 'NonExistentTool', input: { arg: 'val' } }],
      })
      .mockResolvedValueOnce({ text: 'Done with error handling.', toolCalls: [] });

    const result = await executeTask(mockClient as any, model, maxTokens, 'unknown tool', ['use it'], '/tmp');

    // Unknown tool is handled as error tool_result; agent continues
    expect(result).toContain('Done with error handling.');
    expect(mockConsumeStream).toHaveBeenCalledTimes(2);
  });

  it('handles consumeStream errors gracefully', async () => {
    mockConsumeStream.mockRejectedValueOnce(new Error('API error'));

    const result = await executeTask(mockClient as any, model, maxTokens, 'error case', ['do it'], '/tmp');

    expect(result).toContain('API error');
  });

  it('handles multiple parallel subtasks', async () => {
    mockConsumeStream.mockResolvedValue({ text: 'Subtask result.', toolCalls: [] });

    const result = await executeTask(mockClient as any, model, maxTokens, 'multi task', ['sub1', 'sub2'], '/tmp');

    expect(result).toContain('sub1');
    expect(result).toContain('sub2');
    expect(result).toContain('Subtask result.');
    expect(mockConsumeStream).toHaveBeenCalledTimes(2);
  });

  it('stops after max 10 turns', async () => {
    for (let i = 0; i < 11; i++) {
      mockConsumeStream.mockResolvedValueOnce({
        text: `turn ${i}`,
        toolCalls: [{ id: `tc_${i}`, name: 'Bash', input: { command: `echo ${i}` } }],
      });
    }

    const result = await executeTask(mockClient as any, model, maxTokens, 'infinite loop', ['keep going'], '/tmp');

    expect(result).toBeTruthy();
    expect(mockConsumeStream.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
