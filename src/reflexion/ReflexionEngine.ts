import type { LLMClient } from '../agent/LLMClient.js';
import { ExecutionTracker, type ExecutionRecord } from './ExecutionTracker.js';
import { LearningStore, type Reflection } from './LearningStore.js';
import { ReflectionPrompt } from './ReflectionPrompt.js';

export interface ReflexionConfig {
  enabled: boolean;
  failureThreshold: number;
  maxReflections: number;
  autoInject: boolean;
}

/**
 * ReflexionEngine implements the Reflexion pattern:
 * - Track execution outcomes
 * - Trigger reflection after failures
 * - Learn from mistakes
 * - Inject learned patterns into context
 */
export class ReflexionEngine {
  private tracker: ExecutionTracker;
  private learningStore: LearningStore;
  private config: ReflexionConfig;
  private reflectionInProgress = false;

  constructor(config: ReflexionConfig) {
    this.config = config;
    this.tracker = new ExecutionTracker(100);
    this.learningStore = new LearningStore(config.maxReflections);
  }

  /**
   * Record an execution outcome
   */
  recordExecution(record: Omit<ExecutionRecord, 'id'>): string {
    if (!this.config.enabled) return '';
    return this.tracker.record(record);
  }

  /**
   * Check if reflection should be triggered
   */
  shouldReflect(): boolean {
    if (!this.config.enabled || this.reflectionInProgress) return false;
    return this.tracker.hasConsecutiveFailures(this.config.failureThreshold);
  }

  /**
   * Perform reflection using LLM
   */
  async reflect(client: LLMClient, model: string, maxTokens: number): Promise<Reflection | null> {
    if (this.reflectionInProgress) return null;

    this.reflectionInProgress = true;

    try {
      const failures = this.tracker.getRecentFailures(5);
      if (failures.length === 0) return null;

      const trigger = `${failures.length} consecutive failures detected`;
      const prompt = ReflectionPrompt.generate(failures, trigger);

      // Call LLM for reflection (use chat method if available)
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

      // Parse LLM response
      const reflection = this.parseReflectionResponse(response.content, trigger, failures);

      if (reflection) {
        // Save to learning store
        await this.learningStore.save(reflection);
      }

      return reflection;
    } catch (err) {
      console.error('Reflection failed:', err);
      return null;
    } finally {
      this.reflectionInProgress = false;
    }
  }

  /**
   * Parse LLM reflection response
   */
  private parseReflectionResponse(content: string, trigger: string, records: ExecutionRecord[]): Reflection | null {
    try {
      // Extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const data = JSON.parse(jsonStr);

      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        trigger,
        executionIds: records.map((r) => r.id),
        analysis: data.analysis || '',
        patterns: Array.isArray(data.patterns) ? data.patterns : [],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      };
    } catch {
      // Fallback: treat entire content as analysis
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        trigger,
        executionIds: records.map((r) => r.id),
        analysis: content,
        patterns: [],
        recommendations: [],
      };
    }
  }

  /**
   * Get learned patterns summary for system prompt injection
   */
  async getLearnedPatterns(limit = 5): Promise<string> {
    if (!this.config.enabled || !this.config.autoInject) return '';
    return this.learningStore.generatePatternSummary(limit);
  }

  /**
   * Search relevant reflections for current task
   */
  async searchRelevantReflections(query: string, limit = 3): Promise<Reflection[]> {
    if (!this.config.enabled) return [];
    return this.learningStore.search(query, limit);
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return this.tracker.getStats();
  }

  /**
   * Get recent executions
   */
  getRecentExecutions(count = 10): ExecutionRecord[] {
    return this.tracker.getRecent(count);
  }

  /**
   * Clear all execution history
   */
  clearExecutions(): void {
    this.tracker.clear();
  }

  /**
   * Get all reflections
   */
  async getAllReflections(): Promise<Reflection[]> {
    return this.learningStore.getAll();
  }

  /**
   * Delete a reflection
   */
  async deleteReflection(id: string): Promise<void> {
    await this.learningStore.delete(id);
  }
}
