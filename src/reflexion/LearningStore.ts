import { saveMemory, searchMemories, deleteMemory, listMemories, type Memory } from '../utils/memoryStore.js';

export interface Reflection {
  id: string;
  timestamp: number;
  trigger: string;
  executionIds: string[];
  analysis: string;
  patterns: string[];
  recommendations: string[];
}

/**
 * Persistent storage for learned patterns and reflections.
 * Uses the memory system with type='reflection'.
 */
export class LearningStore {
  private maxReflections: number;

  constructor(maxReflections = 50) {
    this.maxReflections = maxReflections;
  }

  /**
   * Save a new reflection
   */
  async save(reflection: Reflection): Promise<void> {
    const key = `reflection_${reflection.id}`;
    const value = JSON.stringify({
      timestamp: reflection.timestamp,
      trigger: reflection.trigger,
      executionIds: reflection.executionIds,
      analysis: reflection.analysis,
      patterns: reflection.patterns,
      recommendations: reflection.recommendations,
    });

    await saveMemory(key, value, 'instruction');

    // Cleanup old reflections if over limit
    await this.pruneOldReflections();
  }

  /**
   * Search reflections by query
   */
  async search(query: string, limit = 5): Promise<Reflection[]> {
    const memories = await searchMemories(query);
    const reflections = memories
      .filter((m) => m.key.startsWith('reflection_'))
      .map(this.memoryToReflection)
      .slice(0, limit);
    return reflections;
  }

  /**
   * Get all reflections
   */
  async getAll(): Promise<Reflection[]> {
    const memories = await searchMemories('reflection_');
    return memories
      .filter((m) => m.key.startsWith('reflection_'))
      .map(this.memoryToReflection)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get recent reflections
   */
  async getRecent(count = 10): Promise<Reflection[]> {
    const all = await this.getAll();
    return all.slice(0, count);
  }

  /**
   * Delete a reflection
   */
  async delete(id: string): Promise<void> {
    const memories = await listMemories();
    const reflection = memories.find((m) => m.key === `reflection_${id}`);
    if (reflection) {
      await deleteMemory(reflection.id);
    }
  }

  /**
   * Prune old reflections to stay under max limit
   */
  private async pruneOldReflections(): Promise<void> {
    const all = await this.getAll();
    if (all.length <= this.maxReflections) return;

    // Delete oldest reflections
    const toDelete = all.slice(this.maxReflections);
    for (const reflection of toDelete) {
      await this.delete(reflection.id);
    }
  }

  /**
   * Convert Memory to Reflection
   */
  private memoryToReflection(memory: Memory): Reflection {
    const id = memory.key.replace('reflection_', '');
    try {
      const data = JSON.parse(memory.value);
      return {
        id,
        timestamp: data.timestamp || Date.now(),
        trigger: data.trigger || '',
        executionIds: data.executionIds || [],
        analysis: data.analysis || '',
        patterns: data.patterns || [],
        recommendations: data.recommendations || [],
      };
    } catch {
      // Fallback for malformed data
      return {
        id,
        timestamp: Date.now(),
        trigger: 'unknown',
        executionIds: [],
        analysis: memory.value,
        patterns: [],
        recommendations: [],
      };
    }
  }

  /**
   * Generate a summary of learned patterns for injection into system prompt
   */
  async generatePatternSummary(limit = 5): Promise<string> {
    const recent = await this.getRecent(limit);
    if (recent.length === 0) return '';

    const parts: string[] = ['## Learned Patterns (from past reflections):'];

    for (const reflection of recent) {
      if (reflection.patterns.length > 0) {
        parts.push(`\n**${reflection.trigger}:**`);
        parts.push(...reflection.patterns.map((p) => `- ${p}`));
      }
      if (reflection.recommendations.length > 0) {
        parts.push('**Recommendations:**');
        parts.push(...reflection.recommendations.map((r) => `- ${r}`));
      }
    }

    return parts.join('\n');
  }
}
