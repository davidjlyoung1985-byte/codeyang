/**
 * Tests for Reflexion Engine
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflexionEngine } from './ReflexionEngine.js';

const config = { enabled: true, failureThreshold: 2, maxReflections: 50, autoInject: true };

describe('ReflexionEngine', () => {
  let engine: ReflexionEngine;

  beforeEach(() => {
    engine = new ReflexionEngine(config);
  });

  it('records an execution', () => {
    const id = engine.recordExecution({
      task: 'test-task',
      toolCalls: [{ name: 'Bash', args: { command: 'echo hi' } }],
      success: true,
      durationMs: 100,
      errorMessage: undefined,
    });
    expect(typeof id).toBe('string');
  });

  it('returns recent executions', () => {
    engine.recordExecution({ task: 't1', toolCalls: [], success: true, durationMs: 10 });
    const recent = engine.getRecentExecutions(5);
    expect(recent.length).toBe(1);
  });

  it('detects shouldReflect after consecutive failures', () => {
    // Configure for low threshold
    const lowThresholdEngine = new ReflexionEngine({ enabled: true, failureThreshold: 2, maxReflections: 50, autoInject: true });
    expect(lowThresholdEngine.shouldReflect()).toBe(false);

    lowThresholdEngine.recordExecution({ task: 'f1', toolCalls: [], success: false, durationMs: 10, errorMessage: 'err' });
    expect(lowThresholdEngine.shouldReflect()).toBe(false);

    lowThresholdEngine.recordExecution({ task: 'f2', toolCalls: [], success: false, durationMs: 10, errorMessage: 'err' });
    expect(lowThresholdEngine.shouldReflect()).toBe(true);
  });

  it('shouldReflect returns false when disabled', () => {
    const disabled = new ReflexionEngine({ ...config, enabled: false });
    expect(disabled.shouldReflect()).toBe(false);
  });

  it('reflect returns null when client has no chat method', async () => {
    engine.recordExecution({ task: 'f1', toolCalls: [], success: false, durationMs: 10, errorMessage: 'err' });
    engine.recordExecution({ task: 'f2', toolCalls: [], success: false, durationMs: 10, errorMessage: 'err' });

    const client = { stream: vi.fn() } as any;
    const result = await engine.reflect(client, 'test-model', 1000);
    expect(result).toBeNull();
  });

  it('reflect returns null on LLM error', async () => {
    engine.recordExecution({ task: 'f1', toolCalls: [], success: false, durationMs: 10, errorMessage: 'err' });
    engine.recordExecution({ task: 'f2', toolCalls: [], success: false, durationMs: 10, errorMessage: 'err' });

    const client = {
      stream: vi.fn(),
      chat: vi.fn().mockRejectedValue(new Error('API error')),
    } as any;

    const result = await engine.reflect(client, 'test-model', 1000);
    expect(result).toBeNull();
  });

  it('returns stats', () => {
    const stats = engine.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.failed).toBe('number');
  });

  it('returns empty learned patterns when no reflections', async () => {
    const patterns = await engine.getLearnedPatterns(5);
    expect(patterns).toBe('');
  });

  it('clears executions', () => {
    engine.recordExecution({ task: 't1', toolCalls: [], success: true, durationMs: 10 });
    engine.clearExecutions();
    expect(engine.getRecentExecutions().length).toBe(0);
  });

  it('getAllReflections returns empty initially', async () => {
    const reflections = await engine.getAllReflections();
    expect(reflections).toEqual([]);
  });

  it('handles deleteReflection gracefully', async () => {
    await expect(engine.deleteReflection('nonexistent')).resolves.toBeUndefined();
  });
});
