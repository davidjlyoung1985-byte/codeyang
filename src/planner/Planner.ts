import type { LLMClient } from '../agent/LLMClient.js';
import type { Plan, PlanStep } from './PlanStore.js';
import { PlanStore } from './PlanStore.js';
import { PlanValidator } from './PlanValidator.js';

export interface PlannerConfig {
  enabled: boolean;
  autoDetect: boolean;
  complexityThreshold: number;
  requireApproval: boolean;
  maxRetries: number;
}

/**
 * Planner implements the Plan-and-Solve pattern:
 * - Detect complex tasks
 * - Generate structured plans
 * - Validate feasibility
 * - Support approval workflow
 */
export class Planner {
  private store: PlanStore;
  private validator: PlanValidator;
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.config = config;
    this.store = new PlanStore();
    this.validator = new PlanValidator();
  }

  /**
   * Detect if a task requires planning
   */
  shouldPlan(task: string): boolean {
    if (!this.config.enabled || !this.config.autoDetect) return false;

    // Heuristics for complex tasks
    const indicators = [
      /step[s]?/i,
      /first.*then/i,
      /plan/i,
      /refactor/i,
      /migrate/i,
      /implement.*feature/i,
      /create.*system/i,
      /build.*from scratch/i,
      /multiple.*file/i,
      /complex/i,
    ];

    const hasComplexityIndicator = indicators.some((pattern) => pattern.test(task));
    const isLongTask = task.split(/[.!?]/).length >= this.config.complexityThreshold;

    return hasComplexityIndicator || isLongTask;
  }

  /**
   * Generate a plan using LLM
   */
  async generatePlan(client: LLMClient, model: string, maxTokens: number, task: string): Promise<Plan | null> {
    try {
      const prompt = this.buildPlanningPrompt(task);

      // Use chat method if available
      if (!client.chat) {
        console.error('LLM client does not support chat method');
        return null;
      }

      const response = await client.chat({
        model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens,
        stream: false,
      });

      const plan = this.parsePlanResponse(response.content, task);

      if (!plan) return null;

      // Validate plan
      const validation = this.validator.validate(plan);
      if (!validation.valid) {
        console.error('Plan validation failed:', validation.errors);
        return null;
      }

      // Save to store
      this.store.save(plan);

      return plan;
    } catch (err) {
      console.error('Plan generation failed:', err);
      return null;
    }
  }

  /**
   * Build planning prompt for LLM
   */
  private buildPlanningPrompt(task: string): string {
    return [
      '# Task Planning',
      '',
      '## Your Task',
      `Generate a detailed, step-by-step plan for: **${task}**`,
      '',
      '## Requirements',
      '1. Break down the task into clear, executable steps',
      '2. For each step, specify:',
      '   - Description (what needs to be done)',
      '   - Tools needed (Read, Write, Edit, Bash, etc.)',
      '   - Dependencies (which steps must complete first)',
      '   - Estimated duration in milliseconds',
      '3. Steps should be ordered by dependencies',
      '4. Each step should be atomic and verifiable',
      '',
      '## Output Format',
      'Respond with JSON only:',
      '```json',
      '{',
      '  "steps": [',
      '    {',
      '      "id": "step_1",',
      '      "description": "Read existing configuration",',
      '      "tools": ["Read"],',
      '      "dependencies": [],',
      '      "estimatedDurationMs": 1000',
      '    },',
      '    {',
      '      "id": "step_2",',
      '      "description": "Update configuration values",',
      '      "tools": ["Edit"],',
      '      "dependencies": ["step_1"],',
      '      "estimatedDurationMs": 2000',
      '    }',
      '  ]',
      '}',
      '```',
      '',
      'Generate the plan now:',
    ].join('\n');
  }

  /**
   * Parse LLM plan response
   */
  private parsePlanResponse(content: string, task: string): Plan | null {
    try {
      // Extract JSON from markdown code blocks (try json, js, then any code block, then raw)
      let jsonStr = content;
      const jsonMatch =
        content.match(/```json\s*(\{[\s\S]*?\})\s*```/) ??
        content.match(/```js\s*(\{[\s\S]*?\})\s*```/) ??
        content.match(/```\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // Try to find a JSON object directly in the text (starts with {)
        const bareJson = content.match(/\{[\s\S]*"steps"[\s\S]*\}/);
        if (bareJson) jsonStr = bareJson[0];
      }

      // Handle trailing commas before parsing (common LLM output issue)
      jsonStr = jsonStr
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas before } or ]
        .replace(/,\s*,/g, ','); // Remove double commas

      const data = JSON.parse(jsonStr);

      if (!data.steps || !Array.isArray(data.steps)) {
        return null;
      }

      const steps: PlanStep[] = data.steps.map(
        (s: {
          id?: string;
          description?: string;
          tools?: string[];
          dependencies?: string[];
          estimatedDurationMs?: number;
        }) => ({
          id: s.id || `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          description: s.description || '',
          tools: Array.isArray(s.tools) ? s.tools : [],
          dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
          status: 'pending' as const,
          retries: 0,
          maxRetries: this.config.maxRetries,
          estimatedDurationMs: s.estimatedDurationMs || 5000,
        }),
      );

      const plan: Plan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        task,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        steps,
        status: 'pending',
        currentStep: 0,
      };

      return plan;
    } catch (err) {
      console.error('Failed to parse plan response:', err);
      return null;
    }
  }

  /**
   * Get a plan by ID
   */
  getPlan(id: string): Plan | undefined {
    return this.store.get(id);
  }

  /**
   * Get all plans
   */
  getAllPlans(): Plan[] {
    return this.store.getAll();
  }

  /**
   * Get active plans
   */
  getActivePlans(): Plan[] {
    return this.store.getActive();
  }

  /**
   * Delete a plan
   */
  deletePlan(id: string): boolean {
    return this.store.delete(id);
  }

  /**
   * Format plan for display
   */
  formatPlan(plan: Plan): string {
    const lines: string[] = [];

    lines.push(`# Plan: ${plan.task}`);
    lines.push(`Status: ${plan.status}`);
    lines.push(`Steps: ${plan.steps.length}`);
    lines.push('');

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const status = this.formatStepStatus(step.status);
      const current = i === plan.currentStep ? '→ ' : '  ';

      lines.push(`${current}${i + 1}. [${status}] ${step.description}`);
      if (step.tools.length > 0) {
        lines.push(`     Tools: ${step.tools.join(', ')}`);
      }
      if (step.dependencies.length > 0) {
        lines.push(`     Depends on: ${step.dependencies.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format step status for display
   */
  private formatStepStatus(status: PlanStep['status']): string {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'in_progress':
        return '🔄';
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'skipped':
        return '⊘';
      default:
        return '?';
    }
  }

  /**
   * Get plan store (for executor)
   */
  getStore(): PlanStore {
    return this.store;
  }

  /**
   * Get plan validator (for executor)
   */
  getValidator(): PlanValidator {
    return this.validator;
  }

  /**
   * Activate a plan (mark first step as in_progress, plan as in_progress).
   * Called after the plan is injected into the conversation.
   */
  activatePlan(planId: string): void {
    const plan = this.store.get(planId);
    if (!plan) return;
    plan.status = 'in_progress';
    plan.updatedAt = Date.now();
    if (plan.steps.length > 0) {
      plan.steps[0].status = 'in_progress';
    }
    this.store.save(plan);
  }

  /**
   * Advance to the next step in the active plan.
   * Marks current step as completed, advances pointer, marks next step as in_progress.
   * Returns the plan progress status string, or null if no active plan.
   */
  advanceStep(planId: string): string | null {
    const plan = this.store.get(planId);
    if (!plan || plan.status !== 'in_progress') return null;

    const steps = plan.steps;
    const current = plan.currentStep;

    // Mark current step as completed
    if (current < steps.length) {
      steps[current].status = 'completed';
    }

    // Advance to next step
    plan.currentStep++;
    plan.updatedAt = Date.now();

    if (plan.currentStep >= steps.length) {
      // All steps done
      plan.status = 'completed';
      this.store.save(plan);
      return this.formatProgress(plan, true);
    }

    // Mark next step as in_progress
    steps[plan.currentStep].status = 'in_progress';
    this.store.save(plan);
    return this.formatProgress(plan, false);
  }

  /**
   * Get a compact progress notice suitable for injection into the conversation.
   */
  getProgressNotice(planId: string): string | null {
    const plan = this.store.get(planId);
    if (!plan || plan.status !== 'in_progress') return null;
    return this.formatProgress(plan, false);
  }

  /**
   * Format plan progress as a compact notice.
   */
  private formatProgress(plan: Plan, done: boolean): string {
    const total = plan.steps.length;
    const completed = plan.steps.filter((s) => s.status === 'completed').length;
    const current = plan.steps[plan.currentStep];

    if (done) {
      return `[Plan] ✅ All ${total} steps completed: "${plan.task}"`;
    }

    const statusIcons: Record<string, string> = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✓',
      failed: '✗',
      skipped: '⊘',
    };

    const progressBar = plan.steps.map((s) => statusIcons[s.status] || '?').join('');

    const lines: string[] = [
      `[Plan Progress] ${completed}/${total} steps complete  ${progressBar}`,
      `Current: Step ${plan.currentStep + 1}/${total} — ${current?.description || '?'}`,
    ];

    return lines.join('\n');
  }

  /**
   * Get the ID of the most recent active plan.
   */
  getLatestActivePlanId(): string | null {
    const active = this.getActivePlans();
    if (active.length === 0) return null;
    // Return the most recently updated active plan
    return active.sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
  }
}
