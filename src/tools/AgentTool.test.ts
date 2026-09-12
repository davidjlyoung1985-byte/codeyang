import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgent, type AgentType } from './AgentTool.js';
import * as registry from './registry.js';

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

describe('AgentTool', () => {
  const mockLLMClient = {
    chat: vi.fn(),
  };

  const mockContext = {
    llmClient: mockLLMClient,
    model: 'test-model',
    maxTokens: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(registry.getCurrentContext).mockReturnValue(mockContext as any);
    vi.mocked(registry.toolSchemas).mockReturnValue([
      { name: 'Read', description: 'Read a file' },
      { name: 'Write', description: 'Write a file' },
      { name: 'Glob', description: 'Find files' },
      { name: 'Grep', description: 'Search in files' },
      { name: 'Bash', description: 'Execute bash' },
      { name: 'GitAdd', description: 'Git add' },
      { name: 'GitCommit', description: 'Git commit' },
      { name: 'GitStatus', description: 'Git status' },
      { name: 'GitDiff', description: 'Git diff' },
      { name: 'GitLog', description: 'Git log' },
      { name: 'WebFetch', description: 'Fetch URL' },
      { name: 'WebSearch', description: 'Search web' },
    ] as any);
  });

  describe('Agent Type: explore', () => {
    it('should create explorer agent with correct prompt', async () => {
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Exploration complete' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      const result = await executeAgent({
        type: 'explore',
        prompt: 'Investigate the codebase',
      });

      expect(result).toContain('Explore Agent');
      expect(result).toContain('Exploration complete');
      expect(mockLLMClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('explorer agent'),
          messages: [{ role: 'user', content: 'Investigate the codebase' }],
        }),
      );
    });

    it('should only allow read-only tools for explore agent', async () => {
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      const toolsArg = mockLLMClient.chat.mock.calls[0][0].tools;
      const toolNames = toolsArg.map((t: any) => t.name);

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
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Plan created' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      const result = await executeAgent({
        type: 'plan',
        prompt: 'Create implementation plan',
      });

      expect(result).toContain('Plan Agent');
      expect(result).toContain('Plan created');
      expect(mockLLMClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('planner agent'),
        }),
      );
    });

    it('should only allow read and design tools for plan agent', async () => {
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      await executeAgent({
        type: 'plan',
        prompt: 'Test',
      });

      const toolsArg = mockLLMClient.chat.mock.calls[0][0].tools;
      const toolNames = toolsArg.map((t: any) => t.name);

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
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Implementation complete' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      const result = await executeAgent({
        type: 'execute',
        prompt: 'Implement the feature',
      });

      expect(result).toContain('Execute Agent');
      expect(result).toContain('Implementation complete');
      expect(mockLLMClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('execution agent'),
        }),
      );
    });

    it('should allow write tools for execute agent', async () => {
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      await executeAgent({
        type: 'execute',
        prompt: 'Test',
      });

      const toolsArg = mockLLMClient.chat.mock.calls[0][0].tools;
      const toolNames = toolsArg.map((t: any) => t.name);

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
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      const memory = 'Previous findings: Bug in auth.ts line 42';

      await executeAgent({
        type: 'execute',
        prompt: 'Fix the bug',
        memory,
      });

      expect(mockLLMClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('Context from previous agents'),
          system: expect.stringContaining(memory),
        }),
      );
    });

    it('should work without memory', async () => {
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      await executeAgent({
        type: 'explore',
        prompt: 'Investigate',
      });

      const systemPrompt = mockLLMClient.chat.mock.calls[0][0].system;
      expect(systemPrompt).not.toContain('Context from previous agents');
    });
  });

  describe('Max turns', () => {
    it('should respect default max turns (15)', async () => {
      let callCount = 0;
      mockLLMClient.chat.mockImplementation(async function* () {
        callCount++;
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tc1', name: 'Read', input: {} },
        };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      vi.mocked(registry.getTool).mockReturnValue({
        execute: vi.fn().mockResolvedValue('file content'),
      } as any);

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      // Should stop after maxTurns (15)
      expect(callCount).toBeLessThanOrEqual(15);
    });

    it('should respect custom max turns', async () => {
      let callCount = 0;
      mockLLMClient.chat.mockImplementation(async function* () {
        callCount++;
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tc1', name: 'Read', input: {} },
        };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      vi.mocked(registry.getTool).mockReturnValue({
        execute: vi.fn().mockResolvedValue('file content'),
      } as any);

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
        maxTurns: 3,
      });

      expect(callCount).toBeLessThanOrEqual(3);
    });

    it('should stop when no tool calls are made', async () => {
      let callCount = 0;
      mockLLMClient.chat.mockImplementation(async function* () {
        callCount++;
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
        maxTurns: 10,
      });

      // Should stop after first turn (no tool calls)
      expect(callCount).toBe(1);
    });
  });

  describe('Tool execution', () => {
    it('should execute allowed tools', async () => {
      const mockToolExecute = vi.fn().mockResolvedValue('file content');

      mockLLMClient.chat
        .mockImplementationOnce(async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tc1', name: 'Read', input: { path: 'test.ts' } },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        })
        .mockImplementationOnce(async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        });

      vi.mocked(registry.getTool).mockReturnValue({
        execute: mockToolExecute,
      } as any);

      await executeAgent({
        type: 'explore',
        prompt: 'Read test.ts',
      });

      expect(mockToolExecute).toHaveBeenCalledWith({ path: 'test.ts' });
    });

    it('should block Question tool in sub-agents', async () => {
      mockLLMClient.chat
        .mockImplementationOnce(async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tc1', name: 'Question', input: {} },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        })
        .mockImplementationOnce(async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        });

      const result = await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      // Question tool should be blocked
      const secondCall = mockLLMClient.chat.mock.calls[1][0];
      const toolResults = secondCall.messages[1].content;
      expect(toolResults[0].content).toContain('not available in sub-agents');
    });

    it('should block Task tool in sub-agents', async () => {
      mockLLMClient.chat
        .mockImplementationOnce(async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tc1', name: 'Task', input: {} },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        })
        .mockImplementationOnce(async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        });

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      const secondCall = mockLLMClient.chat.mock.calls[1][0];
      const toolResults = secondCall.messages[1].content;
      expect(toolResults[0].content).toContain('not available in sub-agents');
    });

    it('should block Agent tool in sub-agents', async () => {
      mockLLMClient.chat
        .mockImplementationOnce(async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tc1', name: 'Agent', input: {} },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        })
        .mockImplementationOnce(async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        });

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      const secondCall = mockLLMClient.chat.mock.calls[1][0];
      const toolResults = secondCall.messages[1].content;
      expect(toolResults[0].content).toContain('not available in sub-agents');
    });

    it('should handle unknown tools gracefully', async () => {
      mockLLMClient.chat
        .mockImplementationOnce(async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tc1', name: 'UnknownTool', input: {} },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        })
        .mockImplementationOnce(async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        });

      vi.mocked(registry.getTool).mockReturnValue(null);

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      const secondCall = mockLLMClient.chat.mock.calls[1][0];
      const toolResults = secondCall.messages[1].content;
      expect(toolResults[0].content).toContain('Unknown tool');
      expect(toolResults[0].is_error).toBe(true);
    });

    it('should handle tool execution errors', async () => {
      mockLLMClient.chat
        .mockImplementationOnce(async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tc1', name: 'Read', input: {} },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        })
        .mockImplementationOnce(async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        });

      vi.mocked(registry.getTool).mockReturnValue({
        execute: vi.fn().mockRejectedValue(new Error('File not found')),
      } as any);

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      const secondCall = mockLLMClient.chat.mock.calls[1][0];
      const toolResults = secondCall.messages[1].content;
      expect(toolResults[0].content).toContain('File not found');
      expect(toolResults[0].is_error).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      mockLLMClient.chat.mockRejectedValue(new Error('API error'));

      const result = await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      expect(result).toContain('Error');
      expect(result).toContain('API error');
    });

    it('should return error message when no LLM client', async () => {
      vi.mocked(registry.getCurrentContext).mockReturnValue(null);

      const result = await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      expect(result).toContain('not available');
      expect(result).toContain('no LLM client');
    });

    it('should return error message when context missing LLM client', async () => {
      vi.mocked(registry.getCurrentContext).mockReturnValue({
        model: 'test',
        maxTokens: 1000,
      } as any);

      const result = await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      expect(result).toContain('not available');
    });
  });

  describe('Configuration', () => {
    it('should use temperature 0.3 for deterministic execution', async () => {
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      expect(mockLLMClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
        }),
      );
    });

    it('should use context model and maxTokens', async () => {
      mockLLMClient.chat.mockImplementation(async function* () {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } };
        yield { type: 'content_block_stop', index: 0 };
        yield { type: 'message_stop' };
      });

      await executeAgent({
        type: 'explore',
        prompt: 'Test',
      });

      expect(mockLLMClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          maxTokens: 1000,
        }),
      );
    });
  });
});
