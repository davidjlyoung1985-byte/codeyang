export interface PlanStep {
  id: string;
  description: string;
  tools: string[];
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  retries: number;
  maxRetries: number;
  estimatedDurationMs?: number;
}

export interface Plan {
  id: string;
  task: string;
  createdAt: number;
  updatedAt: number;
  steps: PlanStep[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  metadata?: Record<string, unknown>;
}

/**
 * Simple in-memory plan storage.
 * Could be extended to persist to disk if needed.
 */
export class PlanStore {
  private plans = new Map<string, Plan>();

  /**
   * Save a plan
   */
  save(plan: Plan): void {
    plan.updatedAt = Date.now();
    this.plans.set(plan.id, plan);
  }

  /**
   * Get a plan by ID
   */
  get(id: string): Plan | undefined {
    return this.plans.get(id);
  }

  /**
   * Get all plans
   */
  getAll(): Plan[] {
    return Array.from(this.plans.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get active plans (in_progress)
   */
  getActive(): Plan[] {
    return this.getAll().filter((p) => p.status === 'in_progress');
  }

  /**
   * Delete a plan
   */
  delete(id: string): boolean {
    return this.plans.delete(id);
  }

  /**
   * Clear all plans
   */
  clear(): void {
    this.plans.clear();
  }

  /**
   * Update plan status
   */
  updateStatus(id: string, status: Plan['status']): void {
    const plan = this.plans.get(id);
    if (plan) {
      plan.status = status;
      plan.updatedAt = Date.now();
    }
  }

  /**
   * Update step status
   */
  updateStepStatus(planId: string, stepId: string, status: PlanStep['status'], result?: string): void {
    const plan = this.plans.get(planId);
    if (!plan) return;

    const step = plan.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = status;
      if (result !== undefined) {
        step.result = result;
      }
      plan.updatedAt = Date.now();
    }
  }

  /**
   * Get current step of a plan
   */
  getCurrentStep(planId: string): PlanStep | undefined {
    const plan = this.plans.get(planId);
    if (!plan || plan.currentStep >= plan.steps.length) return undefined;
    return plan.steps[plan.currentStep];
  }

  /**
   * Advance to next step
   */
  nextStep(planId: string): PlanStep | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;

    plan.currentStep++;
    plan.updatedAt = Date.now();

    if (plan.currentStep >= plan.steps.length) {
      plan.status = 'completed';
      return undefined;
    }

    return plan.steps[plan.currentStep];
  }
}
