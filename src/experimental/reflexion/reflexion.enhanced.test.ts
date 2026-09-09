/**
 * Enhanced tests for Reflexion Engine
 * Coverage: integration tests, edge cases, performance
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflexionEngine } from './ReflexionEngine.js';
import { ExecutionTracker } from './ExecutionTracker.js';
import { ReflectionPrompt } from './ReflectionPrompt.js';
import type { LLMClient } from '../../agent/LLMClient.js';

describe('ReflexionEngine - Enhanced Tests', () => {
  let engine: ReflexionEngine;
  const config = { enabled: true, failureThreshold: 2, maxReflections: 50, autoInject: true };

  beforeEach(() => {
    engine = new ReflexionEngine(config);
  });

  describe('Execution Recording', () => {
    it('records multiple executions and maintains order', () => {
      const id1 = engine.recordExecution({
        task: 'task1',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 100,
      });
      const id2 = engine.recordExecution({
        task: 'task2',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 200,
        errorMessage: 'error',
      });

      const recent = engine.getRecentExecutions(10);
      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe(id1);
      expect(recent[1].id).toBe(id2);
    });

    it('records tool calls and results', () => {
      engine.recordExecution({
        task: 'test-task',
        toolCalls: [
          { name: 'Bash', args: { command: 'ls' } },
          { name: 'Read', args: { file_path: '/test' } },
        ],
        results: [
          { tool: 'Bash', output: 'file1.txt', isError: false },
          { tool: 'Read', output: 'Error: not found', isError: true },
        ],
        success: false,
        durationMs: 150,
        errorMessage: 'File not found',
      });

      const executions = engine.getRecentExecutions(1);
      expect(executions[0].toolCalls).toHaveLength(2);
      expect(executions[0].results).toHaveLength(2);
      expect(executions[0].results[1].isError).toBe(true);
    });

    it('handles execution without error message', () => {
      engine.recordExecution({
        task: 'success-task',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 50,
      });

      const executions = engine.getRecentExecutions(1);
      expect(executions[0].errorMessage).toBeUndefined();
    });
  });

  describe('Reflection Triggering', () => {
    it('does not trigger reflection on single failure', () => {
      engine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      expect(engine.shouldReflect()).toBe(false);
    });

    it('triggers reflection after consecutive failures', () => {
      engine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err1',
      });
      engine.recordExecution({
        task: 'f2',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err2',
      });
      expect(engine.shouldReflect()).toBe(true);
    });

    it('resets trigger after success', () => {
      engine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      engine.recordExecution({
        task: 's1',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 10,
      });
      engine.recordExecution({
        task: 'f2',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      expect(engine.shouldReflect()).toBe(false);
    });

    it('respects custom failure threshold', () => {
      const customEngine = new ReflexionEngine({
        enabled: true,
        failureThreshold: 3,
        maxReflections: 50,
        autoInject: true,
      });

      customEngine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      customEngine.recordExecution({
        task: 'f2',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      expect(customEngine.shouldReflect()).toBe(false);

      customEngine.recordExecution({
        task: 'f3',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      expect(customEngine.shouldReflect()).toBe(true);
    });
  });

  describe('LLM Reflection', () => {
    it('successfully reflects with valid LLM response', async () => {
      engine.recordExecution({
        task: 'f1',
        toolCalls: [{ name: 'Bash', args: { command: 'invalid' } }],
        results: [{ tool: 'Bash', output: 'command not found', isError: true }],
        success: false,
        durationMs: 100,
        errorMessage: 'Command failed',
      });
      engine.recordExecution({
        task: 'f2',
        toolCalls: [{ name: 'Bash', args: { command: 'invalid' } }],
        results: [{ tool: 'Bash', output: 'command not found', isError: true }],
        success: false,
        durationMs: 100,
        errorMessage: 'Command failed',
      });

      const mockClient = {
        chat: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            analysis: 'Commands are not valid',
            patterns: ['Invalid command usage', 'Missing path validation'],
            recommendations: ['Validate commands before execution', 'Add error handling'],
          }),
        }),
      } as unknown as LLMClient;

      const reflection = await engine.reflect(mockClient, 'test-model', 2000);

      expect(reflection).not.toBeNull();
      expect(reflection?.analysis).toBe('Commands are not valid');
      expect(reflection?.patterns).toHaveLength(2);
      expect(reflection?.recommendations).toHaveLength(2);
    });

    it('handles LLM response in markdown code block', async () => {
      engine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      engine.recordExecution({
        task: 'f2',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });

      const mockClient = {
        chat: vi.fn().mockResolvedValue({
          content: `Here's my analysis:
\`\`\`json
{
  "analysis": "Root cause identified",
  "patterns": ["pattern1"],
  "recommendations": ["rec1"]
}
\`\`\``,
        }),
      } as unknown as LLMClient;

      const reflection = await engine.reflect(mockClient, 'test-model', 2000);

      expect(reflection).not.toBeNull();
      expect(reflection?.analysis).toBe('Root cause identified');
    });

    it('falls back to raw text when JSON parsing fails', async () => {
      engine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      engine.recordExecution({
        task: 'f2',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });

      const mockClient = {
        chat: vi.fn().mockResolvedValue({
          content: 'This is a plain text analysis without JSON format',
        }),
      } as unknown as LLMClient;

      const reflection = await engine.reflect(mockClient, 'test-model', 2000);

      expect(reflection).not.toBeNull();
      expect(reflection?.analysis).toBe('This is a plain text analysis without JSON format');
      expect(reflection?.patterns).toEqual([]);
      expect(reflection?.recommendations).toEqual([]);
    });

    it('prevents concurrent reflections', async () => {
      engine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });
      engine.recordExecution({
        task: 'f2',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 10,
        errorMessage: 'err',
      });

      const mockClient = {
        chat: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ content: '{}' }), 100))),
      } as unknown as LLMClient;

      const promise1 = engine.reflect(mockClient, 'test-model', 2000);
      const promise2 = engine.reflect(mockClient, 'test-model', 2000);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).not.toBeNull();
      expect(result2).toBeNull(); // Second call should be blocked
    });
  });

  describe('Statistics', () => {
    it('tracks success and failure rates', () => {
      engine.recordExecution({
        task: 's1',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 100,
      });
      engine.recordExecution({
        task: 'f1',
        toolCalls: [],
        results: [],
        success: false,
        durationMs: 200,
        errorMessage: 'err',
      });
      engine.recordExecution({
        task: 's2',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 150,
      });

      const stats = engine.getStats();
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBeCloseTo(2 / 3);
    });

    it('calculates average duration', () => {
      engine.recordExecution({
        task: 't1',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 100,
      });
      engine.recordExecution({
        task: 't2',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 200,
      });

      const stats = engine.getStats();
      expect(stats.avgDurationMs).toBe(150);
    });
  });

  describe('Pattern Learning', () => {
    it('returns empty patterns when disabled', async () => {
      const disabledEngine = new ReflexionEngine({
        ...config,
        enabled: false,
      });
      const patterns = await disabledEngine.getLearnedPatterns();
      expect(patterns).toBe('');
    });

    it('returns empty patterns when autoInject is false', async () => {
      const noInjectEngine = new ReflexionEngine({
        ...config,
        autoInject: false,
      });
      const patterns = await noInjectEngine.getLearnedPatterns();
      expect(patterns).toBe('');
    });
  });

  describe('Execution History Management', () => {
    it('limits recent executions', () => {
      for (let i = 0; i < 20; i++) {
        engine.recordExecution({
          task: `task${i}`,
          toolCalls: [],
          results: [],
          success: true,
          durationMs: 10,
        });
      }

      const recent = engine.getRecentExecutions(5);
      expect(recent).toHaveLength(5);
      expect(recent[4].task).toBe('task19');
    });

    it('clears execution history', () => {
      engine.recordExecution({
        task: 't1',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 10,
      });
      engine.recordExecution({
        task: 't2',
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 10,
      });

      engine.clearExecutions();

      const recent = engine.getRecentExecutions();
      expect(recent).toHaveLength(0);
      expect(engine.getStats().total).toBe(0);
    });
  });
});

describe('ExecutionTracker - Enhanced Tests', () => {
  let tracker: ExecutionTracker;

  beforeEach(() => {
    tracker = new ExecutionTracker(5); // Small buffer for testing
  });

  it('maintains circular buffer', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({
        task: `task${i}`,
        toolCalls: [],
        results: [],
        success: true,
        durationMs: 10,
        timestamp: Date.now(),
      });
    }

    const all = tracker.getAll();
    expect(all).toHaveLength(5); // Max buffer size
    expect(all[0].task).toBe('task5'); // Oldest in buffer
    expect(all[4].task).toBe('task9'); // Newest in buffer
  });

  it('retrieves executions by IDs', () => {
    const id1 = tracker.record({
      task: 't1',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 10,
      timestamp: Date.now(),
    });
    tracker.record({
      task: 't2',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 10,
      timestamp: Date.now(),
    });
    const id3 = tracker.record({
      task: 't3',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 10,
      timestamp: Date.now(),
    });

    const records = tracker.getByIds([id1, id3]);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(id1);
    expect(records[1].id).toBe(id3);
  });

  it('filters recent failures', () => {
    tracker.record({
      task: 's1',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 10,
      timestamp: Date.now(),
    });
    tracker.record({
      task: 'f1',
      toolCalls: [],
      results: [],
      success: false,
      durationMs: 10,
      timestamp: Date.now(),
      errorMessage: 'err1',
    });
    tracker.record({
      task: 'f2',
      toolCalls: [],
      results: [],
      success: false,
      durationMs: 10,
      timestamp: Date.now(),
      errorMessage: 'err2',
    });

    const failures = tracker.getRecentFailures(10);
    expect(failures).toHaveLength(2);
    expect(failures.every((f) => !f.success)).toBe(true);
  });
});

describe('ReflectionPrompt - Enhanced Tests', () => {
  it('generates detailed prompt with multiple executions', () => {
    const records = [
      {
        id: 'exec_1',
        timestamp: Date.now(),
        task: 'Build project',
        toolCalls: [{ name: 'Bash', args: { command: 'npm build' } }],
        results: [{ tool: 'Bash', output: 'Error: Module not found', isError: true }],
        success: false,
        durationMs: 1500,
        errorMessage: 'Build failed',
      },
      {
        id: 'exec_2',
        timestamp: Date.now(),
        task: 'Run tests',
        toolCalls: [{ name: 'Bash', args: { command: 'npm test' } }],
        results: [{ tool: 'Bash', output: 'Error: No tests found', isError: true }],
        success: false,
        durationMs: 500,
        errorMessage: 'Test failed',
      },
    ];

    const prompt = ReflectionPrompt.generate(records, '2 consecutive failures');

    expect(prompt).toContain('Self-Reflection Task');
    expect(prompt).toContain('2 consecutive failures');
    expect(prompt).toContain('exec_1');
    expect(prompt).toContain('exec_2');
    expect(prompt).toContain('Build project');
    expect(prompt).toContain('Run tests');
    expect(prompt).toContain('Root Cause Analysis');
    expect(prompt).toContain('```json');
  });

  it('generates simple prompt for single failure', () => {
    const record = {
      id: 'exec_1',
      timestamp: Date.now(),
      task: 'Deploy app',
      toolCalls: [],
      results: [],
      success: false,
      durationMs: 1000,
      errorMessage: 'Connection timeout',
    };

    const prompt = ReflectionPrompt.generateSimple(record);

    expect(prompt).toContain('Quick Reflection');
    expect(prompt).toContain('Deploy app');
    expect(prompt).toContain('FAILED');
    expect(prompt).toContain('Connection timeout');
    expect(prompt).toContain('actionable recommendations');
  });

  it('handles successful execution in simple prompt', () => {
    const record = {
      id: 'exec_1',
      timestamp: Date.now(),
      task: 'Test API',
      toolCalls: [],
      results: [],
      success: true,
      durationMs: 200,
    };

    const prompt = ReflectionPrompt.generateSimple(record);

    expect(prompt).toContain('SUCCESS');
    expect(prompt).not.toContain('Error');
  });
});
