import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanExecutor } from './PlanExecutor.js';
import { PlanStore } from './PlanStore.js';
import { PlanValidator } from './PlanValidator.js';
import type { PlanStep, Plan } from './PlanStore.js';

describe('PlanExecutor', () => {
  let store: PlanStore;
  let validator: PlanValidator;
  let executor: PlanExecutor;

  beforeEach(() => {
    store = new PlanStore();
    validator = new PlanValidator();
    executor = new PlanExecutor(store, validator);
  });

  const createPlan = (id: string, steps: Partial<PlanStep>[]): Plan => ({
    id,
    task: 'Test Plan',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'pending',
    currentStep: 0,
    steps: steps.map((step, idx) => ({
      id: step.id || `step${idx + 1}`,
      description: step.description || `Step ${idx + 1}`,
      tools: step.tools || [],
      dependencies: step.dependencies || [],
      maxRetries: step.maxRetries ?? 0,
      retries: step.retries ?? 0,
      status: step.status || 'pending',
    })),
  });

  describe('execute', () => {
    it('executes plan with all steps successfully', async () => {
      const plan = createPlan('plan1', [
        { id: 'step1', dependencies: [] },
        { id: 'step2', dependencies: ['step1'] },
      ]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValue({ success: true, result: 'done' });
      const result = await executor.execute(plan.id, executeStep);

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(2);
      expect(result.totalSteps).toBe(2);
      expect(executeStep).toHaveBeenCalledTimes(2);
    });

    it('returns error for non-existent plan', async () => {
      const executeStep = vi.fn();
      const result = await executor.execute('nonexistent', executeStep);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plan not found');
      expect(executeStep).not.toHaveBeenCalled();
    });

    it('stops execution on step failure', async () => {
      const plan = createPlan('plan2', [
        { id: 'step1', dependencies: [] },
        { id: 'step2', dependencies: ['step1'] },
      ]);
      store.save(plan);

      const executeStep = vi
        .fn()
        .mockResolvedValueOnce({ success: false, result: 'Step failed' })
        .mockResolvedValue({ success: true, result: 'done' });

      const result = await executor.execute(plan.id, executeStep);

      expect(result.success).toBe(false);
      expect(result.completedSteps).toBe(0);
      expect(result.failedStep).toBe('step1');
      expect(result.error).toBe('Step failed');
      expect(executeStep).toHaveBeenCalledTimes(1);
    });

    it('retries failed steps', async () => {
      const plan = createPlan('plan3', [{ id: 'step1', maxRetries: 2 }]);
      store.save(plan);

      const executeStep = vi
        .fn()
        .mockResolvedValueOnce({ success: false, result: 'attempt 1 failed' })
        .mockResolvedValueOnce({ success: false, result: 'attempt 2 failed' })
        .mockResolvedValueOnce({ success: true, result: 'success on retry' });

      const result = await executor.execute(plan.id, executeStep);

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(1);
      expect(executeStep).toHaveBeenCalledTimes(3);
    });

    it('fails after max retries exhausted', async () => {
      const plan = createPlan('plan4', [{ id: 'step1', maxRetries: 1 }]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValue({ success: false, result: 'always fails' });

      const result = await executor.execute(plan.id, executeStep);

      expect(result.success).toBe(false);
      expect(executeStep).toHaveBeenCalledTimes(2);
    });

    it('skips steps with unmet dependencies', async () => {
      const plan = createPlan('plan5', [
        { id: 'step1', dependencies: [] },
        { id: 'step2', dependencies: ['step1'] },
      ]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValueOnce({ success: false, result: 'step1 failed' });

      const result = await executor.execute(plan.id, executeStep);

      expect(result.success).toBe(false);
      expect(result.completedSteps).toBe(0);
      expect(result.failedStep).toBe('step1');
    });

    it('executes steps in dependency order', async () => {
      const executionOrder: string[] = [];
      const plan = createPlan('plan6', [
        { id: 'step3', dependencies: ['step1', 'step2'] },
        { id: 'step1', dependencies: [] },
        { id: 'step2', dependencies: ['step1'] },
      ]);
      store.save(plan);

      const executeStep = vi.fn().mockImplementation(async (step: PlanStep) => {
        executionOrder.push(step.id);
        return { success: true, result: 'done' };
      });

      await executor.execute(plan.id, executeStep);

      expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
    });

    it('handles exceptions during step execution', async () => {
      const plan = createPlan('plan7', [{ id: 'step1' }]);
      store.save(plan);

      const executeStep = vi.fn().mockRejectedValue(new Error('Execution error'));

      const result = await executor.execute(plan.id, executeStep);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution error');
    });

    it('updates plan status to in_progress', async () => {
      const plan = createPlan('plan8', [{ id: 'step1' }]);
      store.save(plan);

      const executeStep = vi.fn().mockImplementation(async () => {
        const updatedPlan = store.get(plan.id);
        expect(updatedPlan?.status).toBe('in_progress');
        return { success: true, result: 'done' };
      });

      await executor.execute(plan.id, executeStep);
    });

    it('updates plan status to completed on success', async () => {
      const plan = createPlan('plan9', [{ id: 'step1' }]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValue({ success: true, result: 'done' });

      await executor.execute(plan.id, executeStep);

      const updatedPlan = store.get(plan.id);
      expect(updatedPlan?.status).toBe('completed');
    });

    it('updates plan status to failed on failure', async () => {
      const plan = createPlan('plan10', [{ id: 'step1' }]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValue({ success: false, result: 'failed' });

      await executor.execute(plan.id, executeStep);

      const updatedPlan = store.get(plan.id);
      expect(updatedPlan?.status).toBe('failed');
    });
  });

  describe('cancel', () => {
    it('cancels an in-progress plan', async () => {
      const plan = createPlan('plan11', [{ id: 'step1' }]);
      store.save(plan);
      store.updateStatus(plan.id, 'in_progress');

      const result = executor.cancel(plan.id);

      expect(result).toBe(true);
      const updatedPlan = store.get(plan.id);
      expect(updatedPlan?.status).toBe('cancelled');
    });

    it('cannot cancel non-existent plan', () => {
      const result = executor.cancel('nonexistent');
      expect(result).toBe(false);
    });

    it('cannot cancel completed plan', () => {
      const plan = createPlan('plan12', [{ id: 'step1' }]);
      store.save(plan);
      store.updateStatus(plan.id, 'completed');

      const result = executor.cancel(plan.id);
      expect(result).toBe(false);
    });
  });

  describe('resume', () => {
    it('resumes failed plan from failed step', async () => {
      const plan = createPlan('plan13', [
        { id: 'step1', status: 'completed' },
        { id: 'step2', status: 'failed', dependencies: ['step1'] },
      ]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValue({ success: true, result: 'done' });

      const result = await executor.resume(plan.id, executeStep);

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(2);
    });

    it('returns error for non-existent plan', async () => {
      const executeStep = vi.fn();
      const result = await executor.resume('nonexistent', executeStep);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plan not found');
    });

    it('resets retry count on resume', async () => {
      const plan = createPlan('plan14', [{ id: 'step1', maxRetries: 2, retries: 2, status: 'failed' }]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValue({ success: true, result: 'done' });

      await executor.resume(plan.id, executeStep);

      const updatedPlan = store.get(plan.id);
      const step = updatedPlan?.steps.find((s) => s.id === 'step1');
      expect(step?.retries).toBe(0);
    });
  });

  describe('getProgress', () => {
    it('returns progress information', () => {
      const plan = createPlan('plan15', [
        { id: 'step1', status: 'completed' },
        { id: 'step2', status: 'pending' },
        { id: 'step3', status: 'pending' },
      ]);
      store.save(plan);

      const progress = executor.getProgress(plan.id);

      expect(progress).toEqual({
        completed: 1,
        total: 3,
        percentage: (1 / 3) * 100,
      });
    });

    it('returns null for non-existent plan', () => {
      const progress = executor.getProgress('nonexistent');
      expect(progress).toBeNull();
    });

    it('returns 0% for plan with no completed steps', () => {
      const plan = createPlan('plan16', [{ id: 'step1', status: 'pending' }]);
      store.save(plan);

      const progress = executor.getProgress(plan.id);

      expect(progress?.percentage).toBe(0);
    });

    it('returns 100% for fully completed plan', () => {
      const plan = createPlan('plan17', [{ id: 'step1', status: 'completed' }]);
      store.save(plan);

      const progress = executor.getProgress(plan.id);

      expect(progress?.percentage).toBe(100);
    });
  });

  describe('callbacks', () => {
    it('calls onAgentText callback during execution', async () => {
      const onAgentText = vi.fn();
      const executorWithCallbacks = new PlanExecutor(store, validator, { onAgentText });

      const plan = createPlan('plan18', [{ id: 'step1' }]);
      store.save(plan);

      const executeStep = vi.fn().mockResolvedValue({ success: true, result: 'done' });

      await executorWithCallbacks.execute(plan.id, executeStep);

      expect(onAgentText).toHaveBeenCalledWith(expect.stringContaining('Executing step'));
    });

    it('calls callback on retry', async () => {
      const onAgentText = vi.fn();
      const executorWithCallbacks = new PlanExecutor(store, validator, { onAgentText });

      const plan = createPlan('plan19', [{ id: 'step1', maxRetries: 1 }]);
      store.save(plan);

      const executeStep = vi
        .fn()
        .mockResolvedValueOnce({ success: false, result: 'failed' })
        .mockResolvedValueOnce({ success: true, result: 'done' });

      await executorWithCallbacks.execute(plan.id, executeStep);

      expect(onAgentText).toHaveBeenCalledWith(expect.stringContaining('Retrying step'));
    });
  });
});
