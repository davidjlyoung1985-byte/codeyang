import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgent } from './AgentTool.js';
import * as registry from './registry.js';
import type { StreamEvent, LLMClient } from '../agent/LLMClient.js';

// Mock dependencies
vi.mock('./registry.js', async () => {
  const actual = await vi.importActual<typeof import('./registry.js')>('./registry.js');
  return {
    ...actual,
    getCurrentContext: vi.fn(),
    getTool: vi.fn(),
    toolSchemas: vi.fn(),
  };
});

/** Build a fake stream that emits a single text delta. */
function textStream(text: string): () => AsyncIterable<StreamEvent> {
  return async function* () {
    yield { type: 'text_delta', text };
  };
}

/** Build a fake stream that emits a single tool call. */
function toolCallStream(id: string, name: string, input: Record<string, unknown>): () => AsyncIterable<StreamEvent> {
  return async function* () {
    yield { type: 'tool_call_start', toolCallIndex: 0, toolCallId: id, toolCallName: name };
    yield { type: 'tool_call_delta', toolCallIndex: 0, toolCallArgs: JSON.stringify(input) };
    yield { type: 'tool_call_end', toolCallIndex: 0 };
  };
}

const TOOL_SCHEMAS: ReturnType<typeof registry.toolSchemas> = [
  { name: 'Read', description: 'Read a file', input_schema: { type: 'object' } },
  { name: 'Write', description: 'Write a file', input_schema: { type: 'object' } },
  { name: 'Glob', description: 'Find files', input_schema: { type: 'object' } },
  { name: 'Grep', description: 'Search in files', input_schema: { type: 'object' } },
  { name: 'Bash', description: 'Execute bash', input_schema: { type: 'object' } },
  { name: 'GitAdd', description: 'Git add', input_schema: { type: 'object' } },
  { name: 'GitCommit', description: 'Git commit', input_schema: { type: 'object' } },
  { name: 'GitStatus', description: 'Git status', input_schema: { type: 'object' } },
  { name: 'GitDiff', description: 'Git diff', input_schema: { type: 'object' } },
  { name: 'GitLog', description: 'Git log', input_schema: { type: 'object' } },
  { name: 'WebFetch', description: 'Fetch URL', input_schema: { type: 'object' } },
  { name: 'WebSearch', description: 'Search web', input_schema: { type: 'object' } },
];

type MockedContext = ReturnType<typeof registry.getCurrentContext>;

describe('AgentTool', () => {
  const mockStream = vi.fn<LLMClient['stream']>();
  const mockLLMClient = { stream: mockStream } as unknown as LLMClient;

  const mockContext = {
    anthropicClient: null,
    llmClient: mockLLMClient,
    model: 'test-model',
    maxTokens: 1000,
    cwd: process.cwd(),
  } as unknown as MockedContext;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(registry.getCurrentContext).mockReturnValue(mockContext);
    vi.mocked(registry.toolSchemas).mockReturnValue(TOOL_SCHEMAS);
  });

  describe('Agent Type: explore', () => {
    it('should create explorer agent with correct prompt', async () => {
      mockStream.mockImplementation(textStream('Exploration complete'));

      const result = await executeAgent({
        type: 'explore',
        prompt: 'Investigate the codebase',
      });

      expect(result).toContain('Explore Agent');
      expect(result).toContain('Exploration complete');
      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('explorer agent'),
          // The source reuses (and later mutates) the messages array, so match
          // the initial user turn rather than the whole array.
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Investigate the codebase' }),
          ]),
        }),
      );
    });

    it('should only allow read-only tools for explore agent', async () => {
      mockStream.mockImplementation(textStream('Done'));

      await executeAgent({ type: 'explore', prompt: 'Test' });

      const toolsArg = mockStream.mock.calls[0][0].tools;
      const toolNames = toolsArg.map((t) => t.name);

      // Should have read-only tools
      expect(toolNames).toContain('Read');
      expect(toolNames).toContain('Glob');
      expect(toolNames).toContain('Grep');
      expect(toolNames).toContain('GitStatus');
      expect(toolNames).toContain('WebFetch');

      // Should NOT have write tools
      expect(toolNames).not.toContain('Write');
      expect(toolNames).not.toContain('Bash');
      expect(toolNames).not.toContain('GitCommit');
    });
  });

  describe('Agent Type: plan', () => {
    it('should create planner agent with correct prompt', async () => {
      mockStream.mockImplementation(textStream('Plan created'));

      const result = await executeAgent({
        type: 'plan',
        prompt: 'Create implementation plan',
      });

      expect(result).toContain('Plan Agent');
      expect(result).toContain('Plan created');
      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('planner agent'),
        }),
      );
    });

    it('should only allow read and design tools for plan agent', async () => {
      mockStream.mockImplementation(textStream('Done'));

      await executeAgent({ type: 'plan', prompt: 'Test' });

      const toolsArg = mockStream.mock.calls[0][0].tools;
      const toolNames = toolsArg.map((t) => t.name);

      // Should have read tools
      expect(toolNames).toContain('Read');
      expect(toolNames).toContain('Glob');

      // Should NOT have write tools
      expect(toolNames).not.toContain('Write');
      expect(toolNames).not.toContain('Bash');
    });
  });

  describe('Agent Type: execute', () => {
    it('should create execution agent with correct prompt', async () => {
      mockStream.mockImplementation(textStream('Implementation complete'));

      const result = await executeAgent({
        type: 'execute',
        prompt: 'Implement the feature',
      });

      expect(result).toContain('Execute Agent');
      expect(result).toContain('Implementation complete');
      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('execution agent'),
        }),
      );
    });

    it('should allow write tools for execute agent', async () => {
      mockStream.mockImplementation(textStream('Done'));

      await executeAgent({ type: 'execute', prompt: 'Test' });

      const toolsArg = mockStream.mock.calls[0][0].tools;
      const toolNames = toolsArg.map((t) => t.name);

      // Should have read tools
      expect(toolNames).toContain('Read');
      expect(toolNames).toContain('Glob');

      // Should have write tools
      expect(toolNames).toContain('Write');
      expect(toolNames).toContain('Bash');
      expect(toolNames).toContain('GitAdd');
      expect(toolNames).toContain('GitCommit');
    });
  });

  describe('Memory sharing', () => {
    it('should include memory from previous agents', async () => {
      mockStream.mockImplementation(textStream('Done'));

      const memory = 'Previous findings: Bug in auth.ts line 42';
      await executeAgent({ type: 'execute', prompt: 'Fix the bug', memory });

      const systemPrompt = mockStream.mock.calls[0][0].system;
      expect(systemPrompt).toContain('Context from previous agents');
      expect(systemPrompt).toContain(memory);
    });

    it('should work without memory', async () => {
      mockStream.mockImplementation(textStream('Done'));

      await executeAgent({ type: 'explore', prompt: 'Investigate' });

      const systemPrompt = mockStream.mock.calls[0][0].system;
      expect(systemPrompt).not.toContain('Context from previous agents');
    });
  });

  describe('Max turns', () => {
    it('should respect default max turns (15)', async () => {
      let callCount = 0;
      mockStream.mockImplementation(async function* () {
        callCount++;
        yield { type: 'tool_call_start', toolCallIndex: 0, toolCallId: 'tc1', toolCallName: 'Read' };
        yield { type: 'tool_call_end', toolCallIndex: 0 };
      });

      vi.mocked(registry.getTool).mockReturnValue({
        execute: vi.fn().mockResolvedValue('file content'),
      } as unknown as ReturnType<typeof registry.getTool>);

      await executeAgent({ type: 'explore', prompt: 'Test' });

      // Should stop after maxTurns (15)
      expect(callCount).toBeLessThanOrEqual(15);
    });

    it('should respect custom max turns', async () => {
      let callCount = 0;
      mockStream.mockImplementation(async function* () {
        callCount++;
        yield { type: 'tool_call_start', toolCallIndex: 0, toolCallId: 'tc1', toolCallName: 'Read' };
        yield { type: 'tool_call_end', toolCallIndex: 0 };
      });

      vi.mocked(registry.getTool).mockReturnValue({
        execute: vi.fn().mockResolvedValue('file content'),
      } as unknown as ReturnType<typeof registry.getTool>);

      await executeAgent({ type: 'explore', prompt: 'Test', maxTurns: 3 });

      expect(callCount).toBeLessThanOrEqual(3);
    });

    it('should stop when no tool calls are made', async () => {
      let callCount = 0;
      mockStream.mockImplementation(async function* () {
        callCount++;
        yield { type: 'text_delta', text: 'Done' };
      });

      await executeAgent({ type: 'explore', prompt: 'Test', maxTurns: 10 });

      // Should stop after first turn (no tool calls)
      expect(callCount).toBe(1);
    });
  });

  describe('Tool execution', () => {
    it('should execute allowed tools', async () => {
      const mockToolExecute = vi.fn().mockResolvedValue('file content');

      mockStream
        .mockImplementationOnce(toolCallStream('tc1', 'Read', { path: 'test.ts' }))
        .mockImplementationOnce(textStream('Done'));

      vi.mocked(registry.getTool).mockReturnValue({
        execute: mockToolExecute,
      } as unknown as ReturnType<typeof registry.getTool>);

      await executeAgent({ type: 'explore', prompt: 'Read test.ts' });

      expect(mockToolExecute).toHaveBeenCalledWith({ path: 'test.ts' });
    });

    it('should block Question tool in sub-agents', async () => {
      mockStream
        .mockImplementationOnce(toolCallStream('tc1', 'Question', {}))
        .mockImplementationOnce(textStream('Done'));

      await executeAgent({ type: 'explore', prompt: 'Test' });

      // Turn 2's message history: [user, assistant, toolResults]
      const secondCall = mockStream.mock.calls[1][0];
      const toolResults = secondCall.messages[2].content as Array<{ content: string }>;
      expect(toolResults[0].content).toContain('not available in sub-agents');
    });

    it('should block Task tool in sub-agents', async () => {
      mockStream.mockImplementationOnce(toolCallStream('tc1', 'Task', {})).mockImplementationOnce(textStream('Done'));

      await executeAgent({ type: 'explore', prompt: 'Test' });

      const secondCall = mockStream.mock.calls[1][0];
      const toolResults = secondCall.messages[2].content as Array<{ content: string }>;
      expect(toolResults[0].content).toContain('not available in sub-agents');
    });

    it('should block Agent tool in sub-agents', async () => {
      mockStream.mockImplementationOnce(toolCallStream('tc1', 'Agent', {})).mockImplementationOnce(textStream('Done'));

      await executeAgent({ type: 'explore', prompt: 'Test' });

      const secondCall = mockStream.mock.calls[1][0];
      const toolResults = secondCall.messages[2].content as Array<{ content: string }>;
      expect(toolResults[0].content).toContain('not available in sub-agents');
    });

    it('should handle unknown tools gracefully', async () => {
      mockStream
        .mockImplementationOnce(toolCallStream('tc1', 'UnknownTool', {}))
        .mockImplementationOnce(textStream('Done'));

      vi.mocked(registry.getTool).mockReturnValue(undefined);

      await executeAgent({ type: 'explore', prompt: 'Test' });

      const secondCall = mockStream.mock.calls[1][0];
      const toolResults = secondCall.messages[2].content as Array<{
        content: string;
        is_error: boolean;
      }>;
      expect(toolResults[0].content).toContain('Unknown tool');
      expect(toolResults[0].is_error).toBe(true);
    });

    it('should handle tool execution errors', async () => {
      mockStream.mockImplementationOnce(toolCallStream('tc1', 'Read', {})).mockImplementationOnce(textStream('Done'));

      vi.mocked(registry.getTool).mockReturnValue({
        execute: vi.fn().mockRejectedValue(new Error('File not found')),
      } as unknown as ReturnType<typeof registry.getTool>);

      await executeAgent({ type: 'explore', prompt: 'Test' });

      const secondCall = mockStream.mock.calls[1][0];
      const toolResults = secondCall.messages[2].content as Array<{
        content: string;
        is_error: boolean;
      }>;
      expect(toolResults[0].content).toContain('File not found');
      expect(toolResults[0].is_error).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      mockStream.mockImplementation(() => {
        throw new Error('API error');
      });

      const result = await executeAgent({ type: 'explore', prompt: 'Test' });

      expect(result).toContain('Error');
      expect(result).toContain('API error');
    });

    it('should return error message when no LLM client', async () => {
      vi.mocked(registry.getCurrentContext).mockReturnValue(null);

      const result = await executeAgent({ type: 'explore', prompt: 'Test' });

      expect(result).toContain('not available');
      expect(result).toContain('no LLM client');
    });

    it('should return error message when context missing LLM client', async () => {
      vi.mocked(registry.getCurrentContext).mockReturnValue({
        model: 'test',
        maxTokens: 1000,
      } as unknown as MockedContext);

      const result = await executeAgent({ type: 'explore', prompt: 'Test' });

      expect(result).toContain('not available');
    });
  });

  describe('Configuration', () => {
    it('should use temperature 0.3 for deterministic execution', async () => {
      mockStream.mockImplementation(textStream('Done'));

      await executeAgent({ type: 'explore', prompt: 'Test' });

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
        }),
      );
    });

    it('should use context model and maxTokens', async () => {
      mockStream.mockImplementation(textStream('Done'));

      await executeAgent({ type: 'explore', prompt: 'Test' });

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          maxTokens: 1000,
        }),
      );
    });
  });
});
