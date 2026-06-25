/**
 * Tree-of-Thoughts (ToT) — parallel exploration of multiple solution paths.
 *
 * Instead of committing to the first solution the LLM generates, ToT:
 * 1. Explores K alternative approaches in parallel (using sub-agents)
 * 2. Evaluates each approach against criteria (correctness, efficiency, safety)
 * 3. Selects the best approach (or merges insights from multiple)
 * 4. Presents the winning approach to the main agent
 *
 * This is triggered automatically for complex tasks detected by the planner.
 */

import { consumeStream, type LLMClient } from '../agent/LLMClient.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface ThoughtPath {
  id: string;
  approach: string;
  steps: string[];
  evaluation: PathEvaluation;
  result: string;
  status: 'exploring' | 'evaluated' | 'selected' | 'failed';
}

export interface PathEvaluation {
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  recommendation: 'select' | 'merge' | 'reject';
}

export interface TreeOfThoughtsResult {
  task: string;
  explored: ThoughtPath[];
  selected: ThoughtPath;
  mergedInsights: string[];
  summary: string;
}

export interface ToTConfig {
  enabled: boolean;
  /** Number of parallel paths to explore */
  numPaths: number;
  /** Minimum score to auto-select (0-100) */
  autoSelectThreshold: number;
  /** Whether to merge insights from multiple paths */
  enableMerging: boolean;
  /** Complexity threshold to trigger ToT (1-10) */
  complexityThreshold: number;
}

const DEFAULT_CONFIG: ToTConfig = {
  enabled: true,
  numPaths: 3,
  autoSelectThreshold: 75,
  enableMerging: true,
  complexityThreshold: 5, // 降低阈值让更多任务走 ToT
};

// ── Prompts ───────────────────────────────────────────────────────────

const EXPLORATION_PROMPT = (task: string, pathIndex: number, numPaths: number) =>
  `You are approach ${pathIndex + 1} of ${numPaths} for solving a task. You must propose a COMPLETELY DIFFERENT solution than the other approaches.

Task: ${task}

Think step by step about your unique approach. Then output in this JSON format:
{
  "approach": "Name of this approach (e.g., 'Recursive bottom-up', 'Iterative with memoization')",
  "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "reasoning": "Why this approach is suitable"
}`;

const EVALUATION_PROMPT = (task: string, approaches: Array<{ id: string; approach: string; steps: string[] }>) =>
  `Evaluate the following solution approaches for the task.

Task: ${task}

${approaches
  .map(
    (a, i) => `
## Approach ${i + 1}: ${a.approach}
${a.steps.map((s) => `  ${s}`).join('\n')}`,
  )
  .join('\n')}

For each approach, evaluate:
1. **Correctness**: Will this produce the right result?
2. **Efficiency**: Is it performant for the expected data size?
3. **Robustness**: Does it handle edge cases and errors?
4. **Complexity**: Is it over-engineered or too simplistic?
5. **Risk**: What could go wrong?

Output as JSON array:
[
  {
    "id": "${approaches[0]?.id || ''}",
    "score": 0-100,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "risks": ["..."],
    "recommendation": "select|merge|reject"
  },
  ...
]`;

const MERGE_PROMPT = (task: string, selected: ThoughtPath, others: ThoughtPath[]) =>
  `You have selected the primary approach for the task.

## Selected Approach: ${selected.approach}
${selected.steps.map((s) => `  ${s}`).join('\n')}

## Other Approaches with Useful Insights:
${others
  .filter((o) => o.evaluation.recommendation === 'merge')
  .map(
    (o) => `
### ${o.approach}
Strengths: ${o.evaluation.strengths.join(', ')}
`,
  )
  .join('\n')}

Extract insights from the other approaches that could improve the selected one.
Output a merged plan as a JSON object:
{
  "mergedSteps": ["Step 1: ...", "Step 2: ..."],
  "insightsAdopted": ["From approach X: ...", "From approach Y: ..."],
  "finalSummary": "Concise summary of the combined approach"
}`;

// ── Engine ────────────────────────────────────────────────────────────

export class TreeOfThoughts {
  private config: ToTConfig;

  constructor(config: Partial<ToTConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Determine whether ToT should be triggered for a given task.
   */
  shouldUseToT(task: string): boolean {
    if (!this.config.enabled) return false;

    // Heuristic: long tasks with multiple requirements benefit from ToT
    const complexityScore = this.estimateComplexity(task);
    return complexityScore >= this.config.complexityThreshold;
  }

  /**
   * Run Tree-of-Thoughts exploration.
   */
  async explore(client: LLMClient, model: string, maxTokens: number, task: string): Promise<TreeOfThoughtsResult> {
    const numPaths = this.config.numPaths;

    // Phase 1: Parallel exploration of K paths
    const explorationPromises = Array.from({ length: numPaths }, (_, i) =>
      this.explorePath(client, model, maxTokens, task, i),
    );

    const paths = await Promise.all(explorationPromises);

    // Phase 2: Evaluate all paths
    const evaluated = await this.evaluatePaths(client, model, maxTokens, task, paths);

    // Phase 3: Select the best path
    const selected = this.selectBestPath(evaluated);
    const selectedPath = selected || evaluated[0];
    if (selectedPath) selectedPath.status = 'selected';

    // Phase 4: Merge insights (if enabled)
    let mergedInsights: string[] = [];
    if (this.config.enableMerging && selected) {
      const mergeable = evaluated.filter((p) => p.id !== selected.id);
      mergedInsights = await this.mergeInsights(client, model, maxTokens, task, selected, mergeable);
    }

    // Phase 5: Generate summary
    const summary = this.generateSummary(task, selectedPath, mergedInsights);

    return {
      task,
      explored: evaluated,
      selected: selectedPath,
      mergedInsights,
      summary,
    };
  }

  /**
   * Format ToT result as a message the agent can use.
   */
  formatResult(result: TreeOfThoughtsResult): string {
    const lines = ['## 🌳 Tree-of-Thoughts Analysis', '', `**Task:** ${result.task}`, '', '### Paths Explored', ''];

    for (const path of result.explored) {
      const isSelected = path.id === result.selected.id;
      lines.push(`**${isSelected ? '✅ ' : ''}${path.approach}** (score: ${path.evaluation.score}/100)`);
      if (isSelected) lines.push('  → *Selected*');
      lines.push('');
      for (const step of path.steps) {
        lines.push(`  ${step}`);
      }
      lines.push('');
    }

    if (result.mergedInsights.length > 0) {
      lines.push('### Merged Insights');
      lines.push('');
      for (const insight of result.mergedInsights) {
        lines.push(`- ${insight}`);
      }
      lines.push('');
    }

    lines.push('### Recommended Plan');
    lines.push('');
    lines.push(result.summary);

    return lines.join('\n');
  }

  // ── Private: Exploration ────────────────────────────────────

  private async explorePath(
    client: LLMClient,
    model: string,
    maxTokens: number,
    task: string,
    pathIndex: number,
  ): Promise<ThoughtPath> {
    const id = `tot-${Date.now().toString(36)}-${pathIndex}`;

    try {
      const result = await consumeStream(client, {
        model,
        maxTokens: Math.min(maxTokens, 4000),
        temperature: 0.7 + pathIndex * 0.1, // increase creativity for later paths
        system: 'You are a solution architect exploring alternative approaches to a problem.',
        messages: [{ role: 'user', content: EXPLORATION_PROMPT(task, pathIndex, this.config.numPaths) }],
        tools: [],
      });

      const data = this.parseExplorationResponse(result.text);

      return {
        id,
        approach: data.approach || `Alternative ${pathIndex + 1}`,
        steps: data.steps || ['Explore the problem', 'Design solution', 'Implement', 'Verify'],
        evaluation: {
          score: 50, // Will be updated by evaluation phase
          strengths: [],
          weaknesses: [],
          risks: [],
          recommendation: 'reject',
        },
        result: result.text,
        status: 'exploring',
      };
    } catch {
      return {
        id,
        approach: `Alternative ${pathIndex + 1}`,
        steps: ['Failed to generate approach'],
        evaluation: { score: 0, strengths: [], weaknesses: ['Generation failed'], risks: [], recommendation: 'reject' },
        result: '',
        status: 'failed',
      };
    }
  }

  private parseExplorationResponse(text: string): { approach?: string; steps?: string[] } {
    try {
      const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        return JSON.parse(jsonStr.slice(start, end + 1));
      }
    } catch {
      // Parse failed
    }
    return {};
  }

  // ── Private: Evaluation ─────────────────────────────────────

  private async evaluatePaths(
    client: LLMClient,
    model: string,
    maxTokens: number,
    task: string,
    paths: ThoughtPath[],
  ): Promise<ThoughtPath[]> {
    const validPaths = paths.filter((p) => p.status === 'exploring' && p.steps.length > 0);
    if (validPaths.length === 0) return paths;

    try {
      const evaluationData = validPaths.map((p) => ({
        id: p.id,
        approach: p.approach,
        steps: p.steps,
      }));

      const result = await consumeStream(client, {
        model,
        maxTokens: Math.min(maxTokens, 4000),
        temperature: 0.3,
        system: 'You are an impartial evaluator of solution approaches. Be objective and critical.',
        messages: [{ role: 'user', content: EVALUATION_PROMPT(task, evaluationData) }],
        tools: [],
      });

      const evaluations = this.parseEvaluationResponse(result.text);

      return paths.map((p) => {
        const evalData = evaluations.find((e) => e.id === p.id);
        if (evalData) {
          return {
            ...p,
            evaluation: {
              score: Math.min(100, Math.max(0, evalData.score || 50)),
              strengths: evalData.strengths || [],
              weaknesses: evalData.weaknesses || [],
              risks: evalData.risks || [],
              recommendation: evalData.recommendation || 'reject',
            },
            status: 'evaluated' as const,
          };
        }
        return p;
      });
    } catch {
      return paths;
    }
  }

  private parseEvaluationResponse(text: string): Array<{
    id: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    risks: string[];
    recommendation: 'select' | 'merge' | 'reject';
  }> {
    try {
      const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;
      const start = jsonStr.indexOf('[');
      const end = jsonStr.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        return JSON.parse(jsonStr.slice(start, end + 1));
      }
    } catch {
      // Parse failed
    }
    return [];
  }

  // ── Private: Selection ──────────────────────────────────────

  private selectBestPath(paths: ThoughtPath[]): ThoughtPath | null {
    const sorted = [...paths]
      .filter((p) => p.evaluation.recommendation !== 'reject')
      .sort((a, b) => b.evaluation.score - a.evaluation.score);

    if (sorted.length === 0) {
      // Fallback: highest score even if all rejected
      return [...paths].sort((a, b) => b.evaluation.score - a.evaluation.score)[0] || null;
    }

    const selected = sorted[0];
    selected.status = 'selected';
    return selected;
  }

  // ── Private: Merging ────────────────────────────────────────

  private async mergeInsights(
    client: LLMClient,
    model: string,
    maxTokens: number,
    task: string,
    selected: ThoughtPath,
    others: ThoughtPath[],
  ): Promise<string[]> {
    try {
      const result = await consumeStream(client, {
        model,
        maxTokens: Math.min(maxTokens, 2000),
        temperature: 0.3,
        system: 'You merge insights from multiple solution approaches into a cohesive plan.',
        messages: [{ role: 'user', content: MERGE_PROMPT(task, selected, others) }],
        tools: [],
      });

      try {
        const jsonMatch = result.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : result.text;
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          const data = JSON.parse(jsonStr.slice(start, end + 1));
          return data.insightsAdopted || [];
        }
      } catch {
        // Parse failed
      }
    } catch {
      // Merge failed — not critical
    }

    return [];
  }

  // ── Private: Helpers ────────────────────────────────────────

  private estimateComplexity(task: string): number {
    let score = 0;

    // Length
    if (task.length > 200) score += 2;
    if (task.length > 500) score += 1;

    // Multiple requirements
    const bulletPoints = (task.match(/[-*•]\s/g) || []).length;
    score += Math.min(bulletPoints, 3);

    // Key words
    const complexityWords = [
      'refactor',
      'optimize',
      'design',
      'architect',
      'migrate',
      'security',
      'performance',
      'scale',
      'distributed',
      'concurrent',
      'parallel',
      'database',
      'api',
      'multiple',
      'integrate',
      'complex',
      'complicated',
      'challenging',
    ];
    for (const word of complexityWords) {
      if (task.toLowerCase().includes(word)) score += 1;
    }

    // Technical terms
    const techTerms = [
      'algorithm',
      'protocol',
      'encryption',
      'transaction',
      'consistency',
      'availability',
      'partition',
      'replication',
    ];
    for (const term of techTerms) {
      if (task.toLowerCase().includes(term)) score += 1;
    }

    return Math.min(score, 10);
  }

  private generateSummary(task: string, selected: ThoughtPath, insights: string[]): string {
    const lines = [
      `**Approach:** ${selected.approach}`,
      `**Confidence:** ${selected.evaluation.score}/100`,
      '',
      '**Execution Steps:**',
    ];

    for (const step of selected.steps) {
      lines.push(`  ${step}`);
    }

    if (insights.length > 0) {
      lines.push('', '**Additional Insights:**');
      for (const insight of insights) {
        lines.push(`  - ${insight}`);
      }
    }

    return lines.join('\n');
  }
}
