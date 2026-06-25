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
   * Find circular dependencies using Kahn's algorithm (iterative, no stack overflow risk).
   */
  private findCircularDependencies(steps: PlanStep[]): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>(); // dep → list of steps that depend on it

    // Initialize
    for (const step of steps) {
      inDegree.set(step.id, 0);
      adjList.set(step.id, []);
    }

    // Build adjacency list and compute in-degrees
    for (const step of steps) {
      for (const dep of step.dependencies) {
        // dep must exist — validated elsewhere
        if (!adjList.has(dep)) continue;
        adjList.get(dep)!.push(step.id);
        inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
      }
    }

    // Start with zero in-degree nodes
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const processed = new Set<string>();
    while (queue.length > 0) {
      const node = queue.shift()!;
      processed.add(node);
      for (const dependent of adjList.get(node) || []) {
        const newDegree = (inDegree.get(dependent) || 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) queue.push(dependent);
      }
    }

    // Nodes not processed = part of a cycle
    const circular: string[] = [];
    for (const step of steps) {
      if (!processed.has(step.id)) {
        circular.push(step.id);
      }
    }

    if (circular.length > 0) {
      return [`Circular dependency involving: ${circular.join(', ')}`];
    }
    return [];
  }

  /**
   * Check if a step's dependencies are satisfied
   */
  canExecuteStep(step: PlanStep, completedSteps: Set<string>): boolean {
    return step.dependencies.every((dep) => completedSteps.has(dep));
  }

  /**
   * Get execution order (topological sort via Kahn's algorithm, iterative, no stack overflow risk).
   */
  getExecutionOrder(steps: PlanStep[]): PlanStep[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>();

    // Initialize in-degrees
    for (const step of steps) {
      inDegree.set(step.id, 0);
    }
    for (const step of steps) {
      step.dependencies.forEach(() => {
        inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
      });
    }

    // Start with zero in-degree nodes
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const order: PlanStep[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const step = stepMap.get(id);
      if (step) order.push(step);

      // Decrement in-degree of dependents
      for (const s of steps) {
        if (s.dependencies.includes(id)) {
          const newDegree = (inDegree.get(s.id) || 1) - 1;
          inDegree.set(s.id, newDegree);
          if (newDegree === 0) queue.push(s.id);
        }
      }
    }

    // Append any remaining steps (in case of circular deps, include them anyway)
    const orderedIds = new Set(order.map((s) => s.id));
    for (const step of steps) {
      if (!orderedIds.has(step.id)) order.push(step);
    }

    return order;
  }
}
