import type { Plan, PlanStep } from './PlanStore.js';
import { toolSchemas } from '../tools/registry.js';

/**
 * Validates plans for feasibility before execution.
 */
export class PlanValidator {
  /**
   * Validate a complete plan
   */
  validate(plan: Plan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if plan has steps
    if (plan.steps.length === 0) {
      errors.push('Plan has no steps');
    }

    // Validate each step
    for (const step of plan.steps) {
      const stepErrors = this.validateStep(step, plan.steps);
      errors.push(...stepErrors);
    }

    // Check for circular dependencies
    const circularDeps = this.findCircularDependencies(plan.steps);
    if (circularDeps.length > 0) {
      errors.push(`Circular dependencies detected: ${circularDeps.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a single step
   */
  private validateStep(step: PlanStep, allSteps: PlanStep[]): string[] {
    const errors: string[] = [];

    // Check if description is meaningful
    if (!step.description || step.description.trim().length < 5) {
      errors.push(`Step ${step.id}: Description is too short or empty`);
    }

    // Check if tools exist
    const availableTools = new Set(toolSchemas().map((t) => t.name));
    for (const tool of step.tools) {
      if (!availableTools.has(tool)) {
        errors.push(`Step ${step.id}: Unknown tool "${tool}"`);
      }
    }

    // Check if dependencies exist
    const stepIds = new Set(allSteps.map((s) => s.id));
    for (const dep of step.dependencies) {
      if (!stepIds.has(dep)) {
        errors.push(`Step ${step.id}: Unknown dependency "${dep}"`);
      }
    }

    // Check if dependencies don't reference self
    if (step.dependencies.includes(step.id)) {
      errors.push(`Step ${step.id}: Cannot depend on itself`);
    }

    return errors;
  }

  /**
   * Find circular dependencies using DFS
   */
  private findCircularDependencies(steps: PlanStep[]): string[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const circular: string[] = [];

    const dfs = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);

      const step = stepMap.get(stepId);
      if (!step) return false;

      for (const dep of step.dependencies) {
        if (!visited.has(dep)) {
          if (dfs(dep)) {
            circular.push(`${stepId} -> ${dep}`);
            return true;
          }
        } else if (recursionStack.has(dep)) {
          circular.push(`${stepId} -> ${dep}`);
          return true;
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id);
      }
    }

    return circular;
  }

  /**
   * Check if a step's dependencies are satisfied
   */
  canExecuteStep(step: PlanStep, completedSteps: Set<string>): boolean {
    return step.dependencies.every((dep) => completedSteps.has(dep));
  }

  /**
   * Get execution order (topological sort)
   */
  getExecutionOrder(steps: PlanStep[]): PlanStep[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const order: PlanStep[] = [];

    const visit = (stepId: string): void => {
      if (visited.has(stepId)) return;

      const step = stepMap.get(stepId);
      if (!step) return;

      visited.add(stepId);

      // Visit dependencies first
      for (const dep of step.dependencies) {
        visit(dep);
      }

      order.push(step);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return order;
  }
}
