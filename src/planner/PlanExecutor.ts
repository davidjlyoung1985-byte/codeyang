import type { PlanStep } from './PlanStore.js';
import type { PlanStore } from './PlanStore.js';
import type { PlanValidator } from './PlanValidator.js';
import type { AgentCallbacks } from '../agent/Agent.js';

export interface PlanExecutionResult {
  planId: string;
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  failedStep?: string;
  error?: string;
}

/**
 * PlanExecutor executes plans with monitoring and error handling.
 */
export class PlanExecutor {
  constructor(
    private store: PlanStore,
    private validator: PlanValidator,
    private callbacks?: AgentCallbacks,
  ) {}

  /**
   * Execute a plan
   */
  async execute(
    planId: string,
    executeStep: (step: PlanStep) => Promise<{ success: boolean; result: string }>,
  ): Promise<PlanExecutionResult> {
    const plan = this.store.get(planId);
    if (!plan) {
      return {
        planId,
        success: false,
        completedSteps: 0,
        totalSteps: 0,
        error: 'Plan not found',
      };
    }

    this.store.updateStatus(planId, 'in_progress');

    let completedSteps = 0;
    const completedStepIds = new Set<string>();

    // Execute steps in topological order
    const executionOrder = this.validator.getExecutionOrder(plan.steps);

    for (const step of executionOrder) {
      // Check if dependencies are satisfied
      if (!this.validator.canExecuteStep(step, completedStepIds)) {
        this.store.updateStepStatus(planId, step.id, 'skipped', 'Dependencies not met');
        continue;
      }

      // Execute step with retries
      const stepResult = await this.executeStepWithRetries(planId, step, executeStep);

      if (stepResult.success) {
        completedSteps++;
        completedStepIds.add(step.id);
        this.store.updateStepStatus(planId, step.id, 'completed', stepResult.result);
      } else {
        this.store.updateStepStatus(planId, step.id, 'failed', stepResult.result);
        this.store.updateStatus(planId, 'failed');

        return {
          planId,
          success: false,
          completedSteps,
          totalSteps: plan.steps.length,
          failedStep: step.id,
          error: stepResult.result,
        };
      }
    }

    this.store.updateStatus(planId, 'completed');

    return {
      planId,
      success: true,
      completedSteps,
      totalSteps: plan.steps.length,
    };
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetries(
    planId: string,
    step: PlanStep,
    executeStep: (step: PlanStep) => Promise<{ success: boolean; result: string }>,
  ): Promise<{ success: boolean; result: string }> {
    this.store.updateStepStatus(planId, step.id, 'in_progress');

    let lastError = '';

    for (let attempt = 0; attempt <= step.maxRetries; attempt++) {
      try {
        this.callbacks?.onAgentText?.(
          attempt === 0
            ? `Executing step: ${step.description}`
            : `Retrying step (${attempt}/${step.maxRetries}): ${step.description}`,
        );

        const result = await executeStep(step);

        if (result.success) {
          return result;
        }

        lastError = result.result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      // Increment retry counter
      step.retries++;
    }

    return { success: false, result: lastError || 'Step failed after max retries' };
  }

  /**
   * Cancel a running plan
   */
  cancel(planId: string): boolean {
    const plan = this.store.get(planId);
    if (!plan || plan.status !== 'in_progress') {
      return false;
    }

    this.store.updateStatus(planId, 'cancelled');
    return true;
  }

  /**
   * Resume a failed plan from the failed step
   */
  async resume(
    planId: string,
    executeStep: (step: PlanStep) => Promise<{ success: boolean; result: string }>,
  ): Promise<PlanExecutionResult> {
    const plan = this.store.get(planId);
    if (!plan) {
      return {
        planId,
        success: false,
        completedSteps: 0,
        totalSteps: 0,
        error: 'Plan not found',
      };
    }

    // Reset failed steps to pending
    for (const step of plan.steps) {
      if (step.status === 'failed') {
        step.status = 'pending';
        step.retries = 0;
      }
    }

    return this.execute(planId, executeStep);
  }

  /**
   * Get plan execution progress
   */
  getProgress(planId: string): { completed: number; total: number; percentage: number } | null {
    const plan = this.store.get(planId);
    if (!plan) return null;

    const completed = plan.steps.filter((s) => s.status === 'completed').length;
    const total = plan.steps.length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;

    return { completed, total, percentage };
  }
}
