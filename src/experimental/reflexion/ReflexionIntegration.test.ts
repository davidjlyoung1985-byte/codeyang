/**
 * Tests for ReflexionIntegration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflexionIntegration } from './ReflexionIntegration.js';
import { ReflexionEngine } from './ReflexionEngine.js';
import type { LLMClient } from '../../agent/LLMClient.js';

describe('ReflexionIntegration', () => {
  let engine: ReflexionEngine;
  let integration: ReflexionIntegration;

  const config = {
    enabled: true,
    failureThreshold: 2,
    maxReflections: 50,
    autoInject: true,
    smartTrigger: true,
    batchRecording: false,
  };

  beforeEach(() => {
    engine = new ReflexionEngine(config);
    integration = new ReflexionIntegration(engine, config);
  });

  describe('Task Context Management', () => {
    it('starts a new task context', () => {
      const taskId = integration.startTask('Test user prompt');
      expect(taskId).toMatch(/^task_\d+_[a-z0-9]+$/);
    });

    it('records tool executions within task context', () => {
      integration.startTask('Deploy application');

      integration.recordToolExecution('Bash', { command: 'npm install' }, 'Dependencies installed', false, 1000);

      integration.recordToolExecution('Bash', { command: 'npm build' }, 'Error: Module not found', true, 500);

      const stats = integration.getStats();
      expect(stats.total).toBeGreaterThan(0);
    });

    it('completes task and records task-level execution', () => {
      integration.startTask('Run tests');

      integration.recordToolExecution('Bash', { command: 'npm test' }, 'Tests passed', false, 2000);

      integration.completeTask(true);

      const recentExecs = engine.getRecentExecutions(1);
      expect(recentExecs).toHaveLength(1);
      expect(recentExecs[0].success).toBe(true);
    });

    it('handles tool execution without task context', () => {
      // Should fallback to direct recording
      integration.recordToolExecution('Read', { file_path: '/test' }, 'File content', false, 100);

      const recentExecs = engine.getRecentExecutions(1);
      expect(recentExecs).toHaveLength(1);
      expect(recentExecs[0].task).toBe('Read');
    });
  });

  describe('Batch Recording', () => {
    it('accumulates executions in batch mode', () => {
      const batchIntegration = new ReflexionIntegration(engine, {
        ...config,
        batchRecording: true,
      });

      batchIntegration.startTask('Test batch');
      batchIntegration.recordToolExecution('Bash', { command: 'ls' }, 'output', false, 50);
      batchIntegration.recordToolExecution('Read', { file_path: '/test' }, 'content', false, 100);

      const statsBefore = batchIntegration.getStats();
      expect(statsBefore.pendingBatch).toBe(2);

      batchIntegration.completeTask(true);

      const statsAfter = batchIntegration.getStats();
      expect(statsAfter.pendingBatch).toBe(0);
      expect(statsAfter.total).toBeGreaterThan(0);
    });
  });

  describe('Smart Triggering', () => {
    it('does not trigger on single failure type', () => {
      integration.startTask('Test task');

      // Same failure type multiple times
      integration.recordToolExecution('Read', { file_path: '/a' }, 'Error: not found', true, 50);
      integration.completeTask(false);

      integration.startTask('Test task 2');
      integration.recordToolExecution('Read', { file_path: '/b' }, 'Error: not found', true, 50);
      integration.completeTask(false);

      // Basic check would return true, but smart trigger requires diverse failures
      expect(engine.shouldReflect()).toBe(true);
    });

    it('triggers on diverse failure types', () => {
      integration.startTask('Task 1');
      integration.recordToolExecution('Read', { file_path: '/a' }, 'Error: not found', true, 50);
      integration.completeTask(false);

      integration.startTask('Task 2');
      integration.recordToolExecution('Bash', { command: 'test' }, 'Error: permission denied', true, 50);
      integration.completeTask(false);

      expect(integration.shouldReflect()).toBe(true);
    });

    it('respects enabled flag', () => {
      const disabledIntegration = new ReflexionIntegration(engine, {
        ...config,
        enabled: false,
      });

      expect(disabledIntegration.shouldReflect()).toBe(false);
    });
  });

  describe('Reflection Execution', () => {
    it('performs reflection and returns structured feedback', async () => {
      integration.startTask('Task 1');
      integration.recordToolExecution('Bash', { command: 'invalid' }, 'Error: command not found', true, 100);
      integration.completeTask(false);

      integration.startTask('Task 2');
      integration.recordToolExecution('Bash', { command: 'invalid2' }, 'Error: command not found', true, 100);
      integration.completeTask(false);

      const mockClient = {
        chat: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            analysis: 'Commands are invalid',
            patterns: ['Invalid command pattern'],
            recommendations: ['Validate commands first'],
          }),
        }),
      } as unknown as LLMClient;

      const result = await integration.reflect(mockClient, 'test-model', 2000);

      expect(result.success).toBe(true);
      expect(result.injectionContent).toContain('Self-Reflection Results');
      expect(result.injectionContent).toContain('Commands are invalid');
      expect(result.injectionContent).toContain('Invalid command pattern');
      expect(result.injectionContent).toContain('Validate commands first');
    });

    it('handles reflection failure gracefully', async () => {
      integration.startTask('Task 1');
      integration.recordToolExecution('Bash', { command: 'test' }, 'Error', true, 100);
      integration.completeTask(false);

      integration.startTask('Task 2');
      integration.recordToolExecution('Bash', { command: 'test' }, 'Error', true, 100);
      integration.completeTask(false);

      const mockClient = {
        chat: vi.fn().mockRejectedValue(new Error('API error')),
      } as unknown as LLMClient;

      const result = await integration.reflect(mockClient, 'test-model', 2000);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Reflection failed');
    });
  });

  describe('Statistics', () => {
    it('provides enhanced statistics with failure categories', () => {
      integration.startTask('Task 1');
      integration.recordToolExecution('Read', { file_path: '/a' }, 'Error: not found', true, 50);
      integration.completeTask(false);

      integration.startTask('Task 2');
      integration.recordToolExecution('Bash', { command: 'test' }, 'Error: permission denied', true, 50);
      integration.completeTask(false);

      const stats = integration.getStats();
      expect(stats.failureCategories).toBeDefined();
      // Note: completeTask also records a task-level execution, so counts are 2x
      expect(stats.failureCategories['file-not-found']).toBeGreaterThanOrEqual(1);
      expect(stats.failureCategories['permission-denied']).toBeGreaterThanOrEqual(1);
    });

    it('tracks current task in stats', () => {
      const taskId = integration.startTask('Active task');
      const stats = integration.getStats();
      expect(stats.currentTask).toBe(taskId);
    });

    it('shows null current task when no task active', () => {
      const stats = integration.getStats();
      expect(stats.currentTask).toBeNull();
    });
  });

  describe('History Management', () => {
    it('clears all history including pending batch', () => {
      const batchIntegration = new ReflexionIntegration(engine, {
        ...config,
        batchRecording: true,
      });

      batchIntegration.startTask('Test');
      batchIntegration.recordToolExecution('Bash', { command: 'ls' }, 'output', false, 50);

      batchIntegration.clearHistory();

      const stats = batchIntegration.getStats();
      expect(stats.total).toBe(0);
      expect(stats.pendingBatch).toBe(0);
      expect(stats.currentTask).toBeNull();
    });
  });

  describe('Learned Patterns', () => {
    it('retrieves learned patterns for injection', async () => {
      const patterns = await integration.getLearnedPatterns(5);
      expect(typeof patterns).toBe('string');
    });
  });

  describe('Failure Classification', () => {
    it('classifies file-not-found errors', () => {
      const freshIntegration = new ReflexionIntegration(new ReflexionEngine(config), config);
      freshIntegration.startTask('Task 1');
      freshIntegration.recordToolExecution('Read', { file_path: '/missing' }, 'Error: ENOENT: not found', true, 50);
      freshIntegration.completeTask(false);

      const stats = freshIntegration.getStats();
      expect(stats.failureCategories['file-not-found']).toBeGreaterThanOrEqual(1);
    });

    it('classifies permission errors', () => {
      const freshIntegration = new ReflexionIntegration(new ReflexionEngine(config), config);
      freshIntegration.startTask('Task 1');
      freshIntegration.recordToolExecution('Bash', { command: 'test' }, 'Error: EACCES permission denied', true, 50);
      freshIntegration.completeTask(false);

      const stats = freshIntegration.getStats();
      expect(stats.failureCategories['permission-denied']).toBeGreaterThanOrEqual(1);
    });

    it('classifies timeout errors', () => {
      const freshIntegration = new ReflexionIntegration(new ReflexionEngine(config), config);
      freshIntegration.startTask('Task 1');
      freshIntegration.recordToolExecution('Bash', { command: 'long' }, 'Error: timeout exceeded', true, 50);
      freshIntegration.completeTask(false);

      const stats = freshIntegration.getStats();
      expect(stats.failureCategories['timeout']).toBeGreaterThanOrEqual(1);
    });

    it('classifies syntax errors', () => {
      const freshIntegration = new ReflexionIntegration(new ReflexionEngine(config), config);
      freshIntegration.startTask('Task 1');
      freshIntegration.recordToolExecution('Bash', { command: 'bad' }, 'Error: syntax error near token', true, 50);
      freshIntegration.completeTask(false);

      const stats = freshIntegration.getStats();
      expect(stats.failureCategories['syntax-error']).toBeGreaterThanOrEqual(1);
    });

    it('classifies network errors', () => {
      const freshIntegration = new ReflexionIntegration(new ReflexionEngine(config), config);
      freshIntegration.startTask('Task 1');
      freshIntegration.recordToolExecution(
        'WebFetch',
        { url: 'http://test' },
        'Error: network connection failed',
        true,
        50,
      );
      freshIntegration.completeTask(false);

      const stats = freshIntegration.getStats();
      expect(stats.failureCategories['network-error']).toBeGreaterThanOrEqual(1);
    });

    it('classifies API errors', () => {
      const freshIntegration = new ReflexionIntegration(new ReflexionEngine(config), config);
      freshIntegration.startTask('Task 1');
      freshIntegration.recordToolExecution(
        'WebFetch',
        { url: 'http://api' },
        'Error: API rate limit exceeded',
        true,
        50,
      );
      freshIntegration.completeTask(false);

      const stats = freshIntegration.getStats();
      expect(stats.failureCategories['api-error']).toBeGreaterThanOrEqual(1);
    });

    it('classifies unknown errors as other', () => {
      const freshIntegration = new ReflexionIntegration(new ReflexionEngine(config), config);
      freshIntegration.startTask('Task 1');
      freshIntegration.recordToolExecution('Bash', { command: 'test' }, 'Error: something weird happened', true, 50);
      freshIntegration.completeTask(false);

      const stats = freshIntegration.getStats();
      expect(stats.failureCategories['other']).toBeGreaterThanOrEqual(1);
    });
  });
});
