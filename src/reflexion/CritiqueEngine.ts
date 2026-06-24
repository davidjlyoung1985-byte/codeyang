/**
 * Iterative Self-Critique Engine.
 *
 * Unlike Reflexion (which focuses on tool execution failures), Self-Critique
 * asks the LLM to evaluate the QUALITY of its own output — not just whether
 * it crashed, but whether the solution is correct, complete, idiomatic, and
 * well-structured.
 *
 * Flow:
 *   Agent generates output
 *   → CritiqueEngine asks LLM to review it
 *   → LLM returns issues (bugs, style, completeness, perf, security)
 *   → Agent fixes issues based on critique
 *   → (optional) Repeat until quality threshold met
 *
 * Key differences from Reflexion:
 *   - Reflexion: "Why did the tool fail?" → fix tool usage patterns
 *   - Critique:  "Is this output good enough?" → improve output quality
 */

import type { LLMClient, LLMMessage } from '../agent/LLMClient.js';
import { consumeStream } from '../agent/LLMClient.js';

export interface CritiqueResult {
  /** 0-100 quality score */
  score: number;
  /** Issues found, grouped by category */
  issues: CritiqueIssue[];
  /** Whether this passed the quality threshold */
  passed: boolean;
  /** Summary of the critique */
  summary: string;
  /** The raw critique text from the LLM */
  raw: string;
}

export interface CritiqueIssue {
  category: 'bug' | 'style' | 'completeness' | 'performance' | 'security' | 'maintainability' | 'correctness';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  description: string;
  lineRef?: string;
  suggestion?: string;
}

export interface CritiqueConfig {
  enabled: boolean;
  /** Minimum quality score to pass (0-100) */
  qualityThreshold: number;
  /** Maximum critique-fix iterations */
  maxIterations: number;
  /** Types of critique to enable */
  categories: CritiqueIssue['category'][];
  /** Whether to critique code-only or code+text responses */
  critiqueCodeOnly: boolean;
}

const DEFAULT_CONFIG: CritiqueConfig = {
  enabled: true,
  qualityThreshold: 80,
  maxIterations: 2,
  categories: ['bug', 'correctness', 'completeness', 'performance', 'security', 'style', 'maintainability'],
  critiqueCodeOnly: true,
};

const CRITIQUE_SYSTEM_PROMPT = `You are a code review expert. Your job is to critique the AI agent's output.

Evaluate the following aspects:
1. **Correctness**: Does the code do what it should? Any logical errors, edge cases, or bugs?
2. **Completeness**: Is the implementation complete? Any missing pieces, TODO markers, or stubs?
3. **Performance**: Any obvious performance issues (O(n²) where O(n) works, unnecessary allocations)?
4. **Security**: Any injection risks, path traversal, credential leaks, or unsafe patterns?
5. **Style**: Does it follow the project's conventions? Consistent naming, error handling patterns?
6. **Maintainability**: Clear naming, appropriate abstractions, good comments?

Respond in this exact JSON format:
{
  "score": <0-100>,
  "summary": "<1-2 sentence summary>",
  "issues": [
    {
      "category": "bug|style|completeness|performance|security|maintainability|correctness",
      "severity": "critical|major|minor|suggestion",
      "description": "<specific issue description>",
      "suggestion": "<how to fix it>"
    }
  ]
}

Be constructive. Score 90+ only if the output is production-quality with no issues.
Score < 60 means significant issues that must be fixed before proceeding.`;

export class CritiqueEngine {
  private config: CritiqueConfig;
  private iterationCount = 0;

  constructor(config: Partial<CritiqueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Critique the agent's last output.
   * If the output contains code blocks, extracts them for focused review.
   */
  async critique(
    client: LLMClient,
    model: string,
    maxTokens: number,
    assistantText: string,
    toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
    toolResults: Array<{ output: string; isError: boolean }>,
  ): Promise<CritiqueResult | null> {
    if (!this.config.enabled) return null;

    const codeContent = this.extractCodeFromOutput(assistantText);

    // Only critique code if configured
    if (this.config.critiqueCodeOnly && !codeContent) return null;

    const reviewContext = [
      '## Assistant Response',
      assistantText.slice(0, 3000),
      '',
      codeContent ? `## Code Blocks to Review\n\`\`\`\n${codeContent.slice(0, 5000)}\n\`\`\`` : '',
      '',
      '## Tool Calls Made',
      ...toolCalls.slice(0, 10).map((tc) => `  - ${tc.name}(${JSON.stringify(tc.input).slice(0, 150)})`),
      '',
      '## Tool Results (errors only)',
      ...toolResults
        .filter((tr) => tr.isError)
        .slice(0, 5)
        .map((tr) => `  - ${tr.output.slice(0, 200)}`),
      '',
      `## Categories to Evaluate`,
      this.config.categories.map((c) => `  - ${c}`).join('\n'),
    ].join('\n');

    try {
      const streamResult = await consumeStream(client, {
        model,
        maxTokens: Math.min(maxTokens, 2000),
        temperature: 0.3,
        system: CRITIQUE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: reviewContext }],
        tools: [],
      });

      return this.parseCritiqueResponse(streamResult.text);
    } catch {
      return null;
    }
  }

  /**
   * Check if the current output meets quality standards.
   * If not, generate a critique message for the agent to act on.
   */
  async checkAndImprove(
    client: LLMClient,
    model: string,
    maxTokens: number,
    assistantText: string,
    toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
    toolResults: Array<{ output: string; isError: boolean }>,
  ): Promise<{ passed: boolean; critiqueMessage?: string; critique?: CritiqueResult }> {
    if (!this.config.enabled || this.iterationCount >= this.config.maxIterations) {
      return { passed: true };
    }

    const critiqueResult = await this.critique(client, model, maxTokens, assistantText, toolCalls, toolResults);

    if (!critiqueResult) {
      return { passed: true };
    }

    this.iterationCount++;

    if (critiqueResult.passed) {
      return { passed: true, critique: critiqueResult };
    }

    // Generate a structured critique message for the agent
    const criticalIssues = critiqueResult.issues.filter((i) => i.severity === 'critical');
    const majorIssues = critiqueResult.issues.filter((i) => i.severity === 'major');

    const critiqueMsg = [
      '## 🔍 Self-Critique Review',
      '',
      `**Quality Score: ${critiqueResult.score}/100** (threshold: ${this.config.qualityThreshold})`,
      '',
      `**Summary:** ${critiqueResult.summary}`,
      '',
      criticalIssues.length > 0
        ? `**Critical Issues (${criticalIssues.length}):**\n${criticalIssues
            .map((i) => `- ${i.description}${i.suggestion ? `\n  → ${i.suggestion}` : ''}`)
            .join('\n')}`
        : '',
      '',
      majorIssues.length > 0
        ? `**Major Issues (${majorIssues.length}):**\n${majorIssues
            .map((i) => `- ${i.description}${i.suggestion ? `\n  → ${i.suggestion}` : ''}`)
            .join('\n')}`
        : '',
      '',
      critiqueResult.issues.filter((i) => i.severity === 'minor' || i.severity === 'suggestion').length > 0
        ? `**Minor/Suggestions:**\n${critiqueResult.issues
            .filter((i) => i.severity === 'minor' || i.severity === 'suggestion')
            .map((i) => `- ${i.description}`)
            .join('\n')}`
        : '',
      '',
      `**Remaining iterations:** ${this.config.maxIterations - this.iterationCount}`,
      '',
      'Please fix the above issues. Focus on critical and major items first.',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      passed: false,
      critiqueMessage: critiqueMsg,
      critique: critiqueResult,
    };
  }

  /** Reset iteration counter for a new round of critique. */
  reset(): void {
    this.iterationCount = 0;
  }

  /** Get current iteration count. */
  getIterationCount(): number {
    return this.iterationCount;
  }

  /** Update config at runtime. */
  updateConfig(config: Partial<CritiqueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ── Private helpers ──────────────────────────────────────────

  private extractCodeFromOutput(text: string): string {
    const blocks: string[] = [];
    const regex = /```(?:\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const code = match[1].trim();
      if (code.length > 20) blocks.push(code);
    }
    return blocks.join('\n\n---\n\n');
  }

  private parseCritiqueResponse(raw: string): CritiqueResult {
    try {
      // Try to extract JSON from markdown code block
      const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : raw;

      // Find JSON object boundaries
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');

      const data = JSON.parse(jsonStr.slice(start, end + 1)) as {
        score: number;
        summary: string;
        issues: Array<{
          category: string;
          severity: string;
          description: string;
          suggestion?: string;
        }>;
      };

      const score = Math.min(100, Math.max(0, data.score));
      const issues: CritiqueIssue[] = (data.issues || []).map((i) => ({
        category: i.category as CritiqueIssue['category'],
        severity: i.severity as CritiqueIssue['severity'],
        description: i.description,
        suggestion: i.suggestion,
      }));

      return {
        score,
        issues,
        passed: score >= this.config.qualityThreshold,
        summary: data.summary || 'No summary provided.',
        raw,
      };
    } catch {
      // Parsing failed — return a best-effort result
      return {
        score: 50,
        issues: [],
        passed: false,
        summary: 'Failed to parse critique response. Manual review recommended.',
        raw,
      };
    }
  }
}
