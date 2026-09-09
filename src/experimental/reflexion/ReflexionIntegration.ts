/**
 * ReflexionIntegration - Enhanced integration layer for Reflexion in Agent
 *
 * Improvements:
 * 1. Better execution context tracking (task grouping)
 * 2. Smart reflection triggering (context-aware)
 * 3. Performance optimization (batch recording)
 * 4. Structured feedback injection
 */

import type { ReflexionEngine } from './ReflexionEngine.js';
import type { ExecutionRecord } from './ExecutionTracker.js';
import type { LLMClient } from '../../agent/LLMClient.js';
import { logger } from '../../utils/logger.js';

export interface TaskContext {
  taskId: string;
  userPrompt: string;
  startTime: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  results: Array<{ tool: string; output: string; isError: boolean }>;
}

export interface ReflexionConfig {
  enabled: boolean;
  failureThreshold: number;
  maxReflections: number;
  autoInject: boolean;
  smartTrigger?: boolean; // New: context-aware triggering
  batchRecording?: boolean; // New: batch execution recording
}

export class ReflexionIntegration {
  private engine: ReflexionEngine;
  private currentTask: TaskContext | null = null;
  private pendingExecutions: Omit<ExecutionRecord, 'id'>[] = [];
  private config: ReflexionConfig;

  constructor(engine: ReflexionEngine, config: ReflexionConfig) {
    this.engine = engine;
    this.config = config;
  }

  /**
   * Start tracking a new task context
   */
  startTask(userPrompt: string): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.currentTask = {
      taskId,
      userPrompt,
      startTime: Date.now(),
      toolCalls: [],
      results: [],
    };
    return taskId;
  }

  /**
   * Record a tool execution within current task
   */
  recordToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    output: string,
    isError: boolean,
    durationMs: number,
  ): void {
    if (!this.currentTask) {
      // Fallback: record directly if no task context
      this.engine.recordExecution({
        task: toolName,
        toolCalls: [{ id: `tool_${Date.now()}`, name: toolName, args }],
        results: [{ tool: toolName, input: args, output, isError }],
        success: !isError,
        errorMessage: isError ? output : undefined,
        durationMs,
        timestamp: Date.now(),
      });
      return;
    }

    this.currentTask.toolCalls.push({ name: toolName, args });
    this.currentTask.results.push({ tool: toolName, output, isError });

    if (this.config.batchRecording) {
      // Batch mode: accumulate executions
      this.pendingExecutions.push({
        task: `${this.currentTask.taskId}: ${toolName}`,
        toolCalls: [{ id: `tool_${Date.now()}`, name: toolName, args }],
        results: [{ tool: toolName, input: args, output, isError }],
        success: !isError,
        errorMessage: isError ? output.slice(0, 200) : undefined,
        durationMs,
        timestamp: Date.now(),
      });
    } else {
      // Immediate mode: record right away
      this.engine.recordExecution({
        task: `${this.currentTask.taskId}: ${toolName}`,
        toolCalls: [{ id: `tool_${Date.now()}`, name: toolName, args }],
        results: [{ tool: toolName, input: args, output, isError }],
        success: !isError,
        errorMessage: isError ? output.slice(0, 200) : undefined,
        durationMs,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Complete current task and flush batch recordings
   */
  completeTask(success: boolean): void {
    if (!this.currentTask) return;

    const durationMs = Date.now() - this.currentTask.startTime;

    // Record task-level execution
    this.engine.recordExecution({
      task: `${this.currentTask.userPrompt.slice(0, 100)}`,
      toolCalls: this.currentTask.toolCalls.map((tc, idx) => ({
        name: tc.name,
        args: tc.args,
        id: `tool_${idx}`,
      })),
      results: this.currentTask.results.map((r) => ({
        tool: r.tool,
        input: {},
        output: r.output,
        isError: r.isError,
      })),
      success,
      errorMessage: success ? undefined : this.getTaskErrorSummary(),
      durationMs,
      timestamp: Date.now(),
    });

    // Flush batch recordings
    if (this.config.batchRecording && this.pendingExecutions.length > 0) {
      for (const exec of this.pendingExecutions) {
        this.engine.recordExecution(exec);
      }
      this.pendingExecutions = [];
    }

    this.currentTask = null;
  }

  /**
   * Check if reflection should be triggered (enhanced with context awareness)
   */
  shouldReflect(): boolean {
    if (!this.config.enabled) return false;

    const basicCheck = this.engine.shouldReflect();
    if (!basicCheck) return false;

    if (!this.config.smartTrigger) return true;

    // Smart triggering: consider failure patterns
    const recentExecs = this.engine.getRecentExecutions(5);
    const failureTypes = new Set(
      recentExecs.filter((e) => !e.success).map((e) => this.classifyFailure(e.errorMessage || '')),
    );

    // Trigger only if we have diverse failure types (indicates systemic issue)
    return failureTypes.size >= 2;
  }

  /**
   * Perform reflection with enhanced feedback
   */
  async reflect(
    client: LLMClient,
    model: string,
    maxTokens: number,
  ): Promise<{
    success: boolean;
    message: string;
    injectionContent?: string;
  }> {
    try {
      const reflection = await this.engine.reflect(client, model, maxTokens);

      if (!reflection) {
        return {
          success: false,
          message: 'Reflection failed: no insights generated',
        };
      }

      // Generate structured feedback message
      const injectionContent = this.formatReflectionFeedback(reflection);

      return {
        success: true,
        message: 'Reflection completed successfully',
        injectionContent,
      };
    } catch (err) {
      logger.error('[ReflexionIntegration] Reflection error:', err);
      return {
        success: false,
        message: `Reflection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Get learned patterns for system prompt injection
   */
  async getLearnedPatterns(limit = 5): Promise<string> {
    return this.engine.getLearnedPatterns(limit);
  }

  /**
   * Get reflection statistics
   */
  getStats() {
    const baseStats = this.engine.getStats();
    const recentExecs = this.engine.getRecentExecutions(10);

    // Calculate failure rate by category
    const failureCategories = new Map<string, number>();
    for (const exec of recentExecs.filter((e) => !e.success)) {
      const category = this.classifyFailure(exec.errorMessage || '');
      failureCategories.set(category, (failureCategories.get(category) || 0) + 1);
    }

    return {
      ...baseStats,
      failureCategories: Object.fromEntries(failureCategories),
      currentTask: this.currentTask?.taskId || null,
      pendingBatch: this.pendingExecutions.length,
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.engine.clearExecutions();
    this.pendingExecutions = [];
    this.currentTask = null;
  }

  // ── Private helpers ──────────────────────────────────────

  private getTaskErrorSummary(): string {
    if (!this.currentTask) return 'Unknown error';

    const errors = this.currentTask.results
      .filter((r) => r.isError)
      .map((r) => `${r.tool}: ${r.output.slice(0, 100)}`)
      .join('; ');

    return errors || 'Task failed without specific error';
  }

  private classifyFailure(errorMessage: string): string {
    const msg = errorMessage.toLowerCase();

    if (msg.includes('not found') || msg.includes('enoent')) return 'file-not-found';
    if (msg.includes('permission') || msg.includes('eacces')) return 'permission-denied';
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('syntax') || msg.includes('parse')) return 'syntax-error';
    if (msg.includes('network') || msg.includes('connection')) return 'network-error';
    if (msg.includes('api') || msg.includes('rate limit')) return 'api-error';

    return 'other';
  }

  private formatReflectionFeedback(reflection: {
    analysis: string;
    patterns: string[];
    recommendations: string[];
  }): string {
    const parts = ['## 🔄 Self-Reflection Results', '', '### Analysis', reflection.analysis, ''];

    if (reflection.patterns.length > 0) {
      parts.push('### Identified Patterns');
      parts.push(...reflection.patterns.map((p, i) => `${i + 1}. ${p}`));
      parts.push('');
    }

    if (reflection.recommendations.length > 0) {
      parts.push('### Recommendations');
      parts.push(...reflection.recommendations.map((r, i) => `${i + 1}. ${r}`));
      parts.push('');
    }

    parts.push('_These insights have been learned and will guide future actions._');

    return parts.join('\n');
  }
}
