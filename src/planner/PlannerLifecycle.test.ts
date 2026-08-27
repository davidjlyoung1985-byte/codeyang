/**
 * Additional tests for Planner lifecycle methods: activatePlan, advanceStep,
 * formatPlan, progress notices, and latest active plan resolution.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Planner } from './Planner.js';
import type { Plan, PlanStep } from './PlanStore.js';
import type { LLMClient } from '../agent/LLMClient.js';

function makeSteps(count: number): PlanStep[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `step_${i + 1}`,
    description: `Step ${i + 1}`,
    tools: i % 2 === 0 ? ['Read'] : ['Edit'],
    dependencies: i === 0 ? [] : [`step_${i}`],
    status: 'pending' as const,
    retries: 0,
    maxRetries: 3,
    estimatedDurationMs: 1000,
  }));
}

function makePlan(id: string, task: string, stepCount = 2, status: Plan['status'] = 'pending'): Plan {
  return {
    id,
    task,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: makeSteps(stepCount),
    status,
    currentStep: 0,
  };
}

describe('Planner lifecycle', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner({
      enabled: true,
      autoDetect: true,
      complexityThreshold: 3,
      requireApproval: false,
      maxRetries: 3,
    });
  });

  describe('activatePlan', () => {
    it('marks the plan in_progress and the first step in_progress', () => {
      const plan = makePlan('p1', 'Task');
      planner.getStore().save(plan);
      planner.activatePlan('p1');

      const updated = planner.getPlan('p1');
      expect(updated?.status).toBe('in_progress');
      expect(updated?.steps[0]?.status).toBe('in_progress');
    });

    it('does nothing for an unknown plan', () => {
      expect(() => planner.activatePlan('nope')).not.toThrow();
    });

    it('handles a plan with zero steps without crashing', () => {
      const plan = makePlan('empty', 'Empty', 0);
      planner.getStore().save(plan);
      expect(() => planner.activatePlan('empty')).not.toThrow();
      expect(planner.getPlan('empty')?.status).toBe('in_progress');
    });
  });

  describe('advanceStep', () => {
    it('returns null when the plan does not exist or is not active', () => {
      expect(planner.advanceStep('missing')).toBeNull();

      const plan = makePlan('pending', 'Task');
      planner.getStore().save(plan);
      expect(planner.advanceStep('pending')).toBeNull();
    });

    it('marks steps complete and progresses through the plan', () => {
      const plan = makePlan('p2', 'Task', 3);
      planner.getStore().save(plan);
      planner.activatePlan('p2');

      const first = planner.advanceStep('p2');
      expect(first).toContain('Step 2');
      expect(planner.getPlan('p2')?.steps[0]?.status).toBe('completed');
      expect(planner.getPlan('p2')?.steps[1]?.status).toBe('in_progress');
      expect(planner.getPlan('p2')?.currentStep).toBe(1);
    });

    it('completes the plan after the final step', () => {
      const plan = makePlan('p3', 'Task', 2);
      planner.getStore().save(plan);
      planner.activatePlan('p3');

      planner.advanceStep('p3');
      const done = planner.advanceStep('p3');

      expect(done).toContain('All 2 steps completed');
      expect(planner.getPlan('p3')?.status).toBe('completed');
    });
  });

  describe('formatPlan', () => {
    it('renders plan metadata, statuses, tools and dependencies', () => {
      const plan = makePlan('p4', 'My task', 2);
      plan.steps[0].status = 'completed';
      plan.steps[1].status = 'in_progress';
      plan.currentStep = 1;

      const out = planner.formatPlan(plan);
      expect(out).toContain('# Plan: My task');
      expect(out).toContain('Status: pending');
      expect(out).toContain('Steps: 2');
      expect(out).toContain('1. [✓] Step 1');
      expect(out).toContain('2. [🔄] Step 2');
      expect(out).toContain('Tools: Read');
      expect(out).toContain('Depends on: step_1');
    });

    it('renders failed and skipped step statuses', () => {
      const plan = makePlan('p5', 'Task', 2);
      plan.steps[0].status = 'failed';
      plan.steps[1].status = 'skipped';

      const out = planner.formatPlan(plan);
      expect(out).toContain('[✗]');
      expect(out).toContain('[⊘]');
    });
  });

  describe('progress notices', () => {
    it('getProgressNotice returns null when plan is not active', () => {
      const plan = makePlan('p6', 'Task');
      planner.getStore().save(plan);
      expect(planner.getProgressNotice('p6')).toBeNull();
    });

    it('getProgressNotice returns progress summary for active plans', () => {
      const plan = makePlan('p7', 'Task', 3);
      planner.getStore().save(plan);
      planner.activatePlan('p7');

      const notice = planner.getProgressNotice('p7');
      expect(notice).toContain('0/3 steps complete');
      expect(notice).toContain('Step 1');
    });
  });

  describe('getLatestActivePlanId', () => {
    it('returns null when there are no active plans', () => {
      expect(planner.getLatestActivePlanId()).toBeNull();
    });

    it('returns the most recently updated active plan', async () => {
      const older = makePlan('older', 'Older', 1, 'in_progress');
      const newer = makePlan('newer', 'Newer', 1, 'in_progress');
      planner.getStore().save(older);
      // ensure distinct updatedAt timestamps
      await new Promise((r) => setTimeout(r, 5));
      planner.getStore().save(newer);
      expect(planner.getLatestActivePlanId()).toBe('newer');
    });

    it('ignores completed plans', () => {
      const done = makePlan('done', 'Done', 1, 'completed');
      const active = makePlan('active', 'Active', 1, 'in_progress');
      done.updatedAt = Date.now() + 100000;

      planner.getStore().save(done);
      planner.getStore().save(active);

      expect(planner.getLatestActivePlanId()).toBe('active');
    });
  });

  describe('parsePlanResponse edge cases', () => {
    it('parses steps missing optional fields with sensible defaults', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: JSON.stringify({
              steps: [{ description: 'Minimal step' }],
            }),
          }),
      } as unknown as LLMClient;

      const plan = await planner.generatePlan(mockClient, 'm', 1000, 'Minimal');
      expect(plan).toBeDefined();
      expect(plan?.steps[0]?.id).toBeTruthy();
      expect(plan?.steps[0]?.tools).toEqual([]);
      expect(plan?.steps[0]?.dependencies).toEqual([]);
      expect(plan?.steps[0]?.estimatedDurationMs).toBe(5000);
    });

    it('returns null when steps key is missing', async () => {
      const mockClient = {
        chat: () => Promise.resolve({ content: JSON.stringify({ notSteps: [] }) }),
      } as unknown as LLMClient;

      const plan = await planner.generatePlan(mockClient, 'm', 1000, 'Bad');
      expect(plan).toBeNull();
    });

    it('returns null when plan validation fails', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: JSON.stringify({ steps: [] }),
          }),
      } as unknown as LLMClient;

      const plan = await planner.generatePlan(mockClient, 'm', 1000, 'Invalid');
      expect(plan).toBeNull();
    });

    it('parses a bare JSON object without code fences', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content:
              'Here is the plan: {"steps":[{"id":"s1","description":"Do it","tools":[],"dependencies":[],"estimatedDurationMs":1000}]} done',
          }),
      } as unknown as LLMClient;

      const plan = await planner.generatePlan(mockClient, 'm', 1000, 'Bare');
      expect(plan).toBeDefined();
      expect(plan?.steps).toHaveLength(1);
    });
  });
});
