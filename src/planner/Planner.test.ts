import { describe, it, expect, beforeEach } from 'vitest';
import { Planner } from './Planner.js';
import { PlanStore } from './PlanStore.js';
import type { Plan } from './PlanStore.js';
import type { LLMClient } from '../agent/LLMClient.js';

describe('Planner', () => {
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

  describe('shouldPlan', () => {
    it('should detect tasks with complexity indicators', () => {
      expect(planner.shouldPlan('Create a multi-step refactoring plan')).toBe(true);
      expect(planner.shouldPlan('First read the file, then edit it')).toBe(true);
      expect(planner.shouldPlan('Plan the migration from v1 to v2')).toBe(true);
      expect(planner.shouldPlan('Implement a new feature with multiple files')).toBe(true);
      expect(planner.shouldPlan('Build a complex system from scratch')).toBe(true);
    });

    it('should detect long tasks based on complexity threshold', () => {
      const longTask = 'Do step 1. Then do step 2. Then do step 3. Finally do step 4.';
      expect(planner.shouldPlan(longTask)).toBe(true);
    });

    it('should not plan simple tasks', () => {
      expect(planner.shouldPlan('Read config.json')).toBe(false);
      expect(planner.shouldPlan('List files')).toBe(false);
      expect(planner.shouldPlan('Show version')).toBe(false);
    });

    it('should respect enabled config', () => {
      const disabledPlanner = new Planner({
        enabled: false,
        autoDetect: true,
        complexityThreshold: 3,
        requireApproval: false,
        maxRetries: 3,
      });

      expect(disabledPlanner.shouldPlan('Create a complex refactoring plan')).toBe(false);
    });

    it('should respect autoDetect config', () => {
      const manualPlanner = new Planner({
        enabled: true,
        autoDetect: false,
        complexityThreshold: 3,
        requireApproval: false,
        maxRetries: 3,
      });

      expect(manualPlanner.shouldPlan('Create a complex plan')).toBe(false);
    });
  });

  describe('generatePlan', () => {
    it('should return null if client does not support chat', async () => {
      const mockClient = {} as LLMClient;

      const result = await planner.generatePlan(mockClient, 'model', 1000, 'test task');

      expect(result).toBeNull();
    });

    it('should parse valid plan response', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: JSON.stringify({
              steps: [
                {
                  id: 'step_1',
                  description: 'Read configuration file',
                  tools: ['Read'],
                  dependencies: [],
                  estimatedDurationMs: 1000,
                },
                {
                  id: 'step_2',
                  description: 'Edit configuration values',
                  tools: ['Edit'],
                  dependencies: ['step_1'],
                  estimatedDurationMs: 2000,
                },
              ],
            }),
          }),
      } as LLMClient;

      const result = await planner.generatePlan(mockClient, 'model', 1000, 'Update config');

      expect(result).toBeDefined();
      expect(result?.steps).toHaveLength(2);
      expect(result?.steps[0]?.id).toBe('step_1');
      expect(result?.task).toBe('Update config');
      expect(result?.status).toBe('pending');
    });

    it('should parse plan with markdown code blocks', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: `Here's the plan:
\`\`\`json
{
  "steps": [
    {
      "id": "step_1",
      "description": "Initialize project using bash",
      "tools": ["Bash"],
      "dependencies": [],
      "estimatedDurationMs": 5000
    }
  ]
}
\`\`\``,
          }),
      } as LLMClient;

      const result = await planner.generatePlan(mockClient, 'model', 1000, 'Init project');

      expect(result).toBeDefined();
      expect(result?.steps).toHaveLength(1);
      expect(result?.steps[0]?.description).toBe('Initialize project using bash');
    });

    it('should handle trailing commas in JSON', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: `{
  "steps": [
    {
      "id": "step_1",
      "description": "Test reading files",
      "tools": ["Read"],
      "dependencies": [],
      "estimatedDurationMs": 1000,
    },
  ]
}`,
          }),
      } as LLMClient;

      const result = await planner.generatePlan(mockClient, 'model', 1000, 'Test task');

      expect(result).toBeDefined();
      expect(result?.steps).toHaveLength(1);
    });

    it('should return null for invalid JSON', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: 'This is not valid JSON',
          }),
      } as LLMClient;

      const result = await planner.generatePlan(mockClient, 'model', 1000, 'Invalid');

      expect(result).toBeNull();
    });

    it('should handle plan generation errors', async () => {
      const mockClient = {
        chat: () => {
          throw new Error('API error');
        },
      } as LLMClient;

      const result = await planner.generatePlan(mockClient, 'model', 1000, 'Error task');

      expect(result).toBeNull();
    });
  });

  describe('Plan retrieval', () => {
    it('should retrieve saved plan', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: JSON.stringify({
              steps: [
                {
                  id: 'step_1',
                  description: 'Test step',
                  tools: ['Read'],
                  dependencies: [],
                  estimatedDurationMs: 1000,
                },
              ],
            }),
          }),
      } as LLMClient;

      const plan = await planner.generatePlan(mockClient, 'model', 1000, 'Task');

      if (!plan) {
        throw new Error('Plan generation failed');
      }

      const retrieved = planner.getPlan(plan.id);
      expect(retrieved).toEqual(plan);
    });

    it('should list all plans', async () => {
      const mockClient = {
        chat: () =>
          Promise.resolve({
            content: JSON.stringify({
              steps: [
                {
                  id: 'step_1',
                  description: 'Read and analyze files',
                  tools: ['Read'],
                  dependencies: [],
                  estimatedDurationMs: 1000,
                },
              ],
            }),
          }),
      } as LLMClient;

      const plan1 = await planner.generatePlan(mockClient, 'model', 1000, 'Task 1');
      const plan2 = await planner.generatePlan(mockClient, 'model', 1000, 'Task 2');

      expect(plan1).toBeDefined();
      expect(plan2).toBeDefined();

      const plans = planner.getAllPlans();
      expect(plans.length).toBeGreaterThanOrEqual(2);

      // Verify both tasks are in the list
      const taskNames = plans.map((p) => p.task);
      expect(taskNames).toContain('Task 1');
      expect(taskNames).toContain('Task 2');
    });
  });
});

describe('PlanStore', () => {
  let store: PlanStore;
  let mockPlan: Plan;

  beforeEach(() => {
    store = new PlanStore();
    mockPlan = {
      id: 'plan_123',
      task: 'Test task',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [
        {
          id: 'step_1',
          description: 'First step',
          tools: ['Read'],
          dependencies: [],
          status: 'pending',
          retries: 0,
          maxRetries: 3,
        },
      ],
      status: 'pending',
      currentStep: 0,
    };
  });

  describe('Basic operations', () => {
    it('should save and retrieve plan', () => {
      store.save(mockPlan);
      const retrieved = store.get('plan_123');

      expect(retrieved).toEqual(mockPlan);
    });

    it('should return undefined for non-existent plan', () => {
      const result = store.get('non_existent');
      expect(result).toBeUndefined();
    });

    it('should update plan timestamp on save', () => {
      const originalTimestamp = mockPlan.updatedAt;

      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        store.save(mockPlan);
        expect(mockPlan.updatedAt).toBeGreaterThan(originalTimestamp);
      }, 10);
    });

    it('should delete plan', () => {
      store.save(mockPlan);
      const deleted = store.delete('plan_123');

      expect(deleted).toBe(true);
      expect(store.get('plan_123')).toBeUndefined();
    });

    it('should return false when deleting non-existent plan', () => {
      const result = store.delete('non_existent');
      expect(result).toBe(false);
    });

    it('should clear all plans', () => {
      store.save(mockPlan);
      store.save({ ...mockPlan, id: 'plan_456' });

      store.clear();

      expect(store.getAll()).toHaveLength(0);
    });
  });

  describe('Query operations', () => {
    it('should get all plans sorted by creation time', () => {
      const plan1 = { ...mockPlan, id: 'plan_1', createdAt: 1000 };
      const plan2 = { ...mockPlan, id: 'plan_2', createdAt: 2000 };
      const plan3 = { ...mockPlan, id: 'plan_3', createdAt: 1500 };

      store.save(plan1);
      store.save(plan2);
      store.save(plan3);

      const plans = store.getAll();
      expect(plans).toHaveLength(3);
      expect(plans[0]?.id).toBe('plan_2'); // Most recent first
      expect(plans[1]?.id).toBe('plan_3');
      expect(plans[2]?.id).toBe('plan_1');
    });

    it('should get active plans only', () => {
      const activePlan = { ...mockPlan, id: 'active', status: 'in_progress' as const };
      const completedPlan = { ...mockPlan, id: 'completed', status: 'completed' as const };
      const pendingPlan = { ...mockPlan, id: 'pending', status: 'pending' as const };

      store.save(activePlan);
      store.save(completedPlan);
      store.save(pendingPlan);

      const active = store.getActive();
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe('active');
    });
  });

  describe('Status updates', () => {
    it('should update plan status', () => {
      store.save(mockPlan);
      store.updateStatus('plan_123', 'in_progress');

      const updated = store.get('plan_123');
      expect(updated?.status).toBe('in_progress');
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(mockPlan.updatedAt);
    });

    it('should update step status', () => {
      store.save(mockPlan);
      store.updateStepStatus('plan_123', 'step_1', 'completed');

      const updated = store.get('plan_123');
      expect(updated?.steps[0]?.status).toBe('completed');
    });

    it('should handle non-existent plan gracefully', () => {
      expect(() => {
        store.updateStatus('non_existent', 'completed');
      }).not.toThrow();
    });

    it('should handle non-existent step gracefully', () => {
      store.save(mockPlan);
      expect(() => {
        store.updateStepStatus('plan_123', 'non_existent_step', 'completed');
      }).not.toThrow();
    });
  });

  describe('Step navigation', () => {
    it('should get current step', () => {
      const planWithSteps = {
        ...mockPlan,
        steps: [
          { ...mockPlan.steps[0]!, id: 'step_1', description: 'First' },
          { ...mockPlan.steps[0]!, id: 'step_2', description: 'Second' },
        ],
        currentStep: 0,
      };

      store.save(planWithSteps);
      const current = store.getCurrentStep('plan_123');

      expect(current?.id).toBe('step_1');
      expect(current?.description).toBe('First');
    });

    it('should advance to next step', () => {
      const planWithSteps = {
        ...mockPlan,
        steps: [
          { ...mockPlan.steps[0]!, id: 'step_1' },
          { ...mockPlan.steps[0]!, id: 'step_2' },
          { ...mockPlan.steps[0]!, id: 'step_3' },
        ],
        currentStep: 0,
      };

      store.save(planWithSteps);
      const nextStep = store.nextStep('plan_123');

      expect(nextStep?.id).toBe('step_2');

      const updated = store.get('plan_123');
      expect(updated?.currentStep).toBe(1);
    });

    it('should complete plan when advancing beyond last step', () => {
      const planWithSteps = {
        ...mockPlan,
        steps: [
          { ...mockPlan.steps[0]!, id: 'step_1' },
          { ...mockPlan.steps[0]!, id: 'step_2' },
        ],
        currentStep: 1,
      };

      store.save(planWithSteps);
      const result = store.nextStep('plan_123');

      expect(result).toBeUndefined();

      const updated = store.get('plan_123');
      expect(updated?.status).toBe('completed');
      expect(updated?.currentStep).toBe(2);
    });

    it('should return undefined for non-existent plan', () => {
      const result = store.nextStep('non_existent');
      expect(result).toBeUndefined();
    });
  });
});
