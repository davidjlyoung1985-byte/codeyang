/**
 * Comprehensive tests for TreeOfThoughts explore/evaluate/select/merge pipeline.
 * Uses a fake in-memory LLM client (no network, no API key).
 */
import { describe, it, expect } from 'vitest';
import { TreeOfThoughts, type TreeOfThoughtsResult } from './TreeOfThoughts.js';
import type { LLMClient, StreamEvent } from '../agent/LLMClient.js';

function textStream(text: string): AsyncIterable<StreamEvent> {
  return (async function* () {
    yield { type: 'text_delta', text };
  })();
}

/** Build a fake client whose responses are chosen by the system prompt. */
function fakeClient(bySystem: (system: string) => string): LLMClient {
  return {
    stream(params) {
      return textStream(bySystem(params.system));
    },
  };
}

/** Client that, for evaluation requests, extracts real path ids from the prompt and returns per-id scores. */
function evaluatingClient(scores: number[], recommendations: string[] = scores.map(() => 'select')): LLMClient {
  return {
    stream(params) {
      const system = params.system;
      if (system.includes('solution architect')) {
        return textStream(EXPLORE_JSON('Path', ['Step 1', 'Step 2']));
      }
      if (system.includes('impartial evaluator')) {
        // ids are embedded in the EVALUATION_PROMPT as `"id": "..."` per approach
        const content = params.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
        const ids = [...content.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
        return textStream(
          EVALUATION_JSON(
            ids.map((id, i) => ({
              id,
              score: scores[i] ?? 50,
              recommendation: recommendations[i] ?? 'reject',
            })),
          ),
        );
      }
      if (system.includes('merge insights')) return textStream(MERGE_JSON(['insight-1', 'insight-2']));
      return textStream('{}');
    },
  };
}

const EXPLORE_JSON = (approach: string, steps: string[]) => JSON.stringify({ approach, steps, reasoning: 'x' });

const EVALUATION_JSON = (entries: Array<{ id: string; score: number; recommendation: string }>) =>
  JSON.stringify(entries);

const MERGE_JSON = (insights: string[]) =>
  JSON.stringify({ mergedSteps: ['m1'], insightsAdopted: insights, finalSummary: 's' });

function makeExplorer() {
  const explore = fakeClient((system) => {
    if (system.includes('solution architect')) return EXPLORE_JSON(`Approach ${Math.random()}`, ['A', 'B']);
    if (system.includes('impartial evaluator')) {
      return EVALUATION_JSON([
        { id: 'tot-a-0', score: 90, recommendation: 'select' },
        { id: 'tot-a-1', score: 70, recommendation: 'merge' },
        { id: 'tot-a-2', score: 40, recommendation: 'reject' },
      ]);
    }
    if (system.includes('merge insights')) return MERGE_JSON(['insight-1', 'insight-2']);
    return '{}';
  });
  return new TreeOfThoughts({ numPaths: 3, autoSelectThreshold: 75 });
}

/**
 * Build a fake client that returns evaluation scores keyed by the REAL path ids
 * derived from the evaluation prompt (which contains them in order).
 */
function fakeEvaluatingClient(scores: number[], recommendations: string[] = scores.map(() => 'select')) {
  return fakeClient((system) => {
    if (system.includes('solution architect')) {
      return EXPLORE_JSON('Path', ['Step 1', 'Step 2']);
    }
    if (system.includes('impartial evaluator')) {
      // The EVALUATION_PROMPT embeds path ids in the approach list. Extract them.
      const idMatch = [...system.matchAll(/## Approach \d+: /g)];
      // ids are NOT in the prompt text; they come from evaluationData. We instead
      // reconstruct from the message body: each "Approach N" is preceded by the path's
      // id in the JSON-serialized evaluationData. Fall back to the standard pattern.
      const ids = scores.map((_, i) => `tot-xxxx-${i}`);
      return EVALUATION_JSON(ids.map((id, i) => ({ id, score: scores[i], recommendation: recommendations[i] })));
    }
    if (system.includes('merge insights')) return MERGE_JSON(['insight-1']);
    return '{}';
  });
}

describe('TreeOfThoughts.explore', () => {
  it('runs the full pipeline and returns a selected path with merged insights', async () => {
    const tot = makeExplorer();
    const client = evaluatingClient([90, 70, 40], ['select', 'merge', 'reject']);

    const result: TreeOfThoughtsResult = await tot.explore(client, 'model-x', 8000, 'complex task');

    expect(result.explored).toHaveLength(3);
    expect(result.selected).toBeDefined();
    expect(result.selected.status).toBe('selected');
    expect(result.selected.evaluation.score).toBe(90);
    expect(result.mergedInsights).toEqual(['insight-1', 'insight-2']);
    expect(result.summary).toContain('**Approach:**');
  });

  it('falls back to the first path when evaluation returns no matching ids', async () => {
    const tot = makeExplorer();
    // evaluation returns entries with wrong ids -> no matches
    const client = fakeClient((system) => {
      if (system.includes('solution architect')) return EXPLORE_JSON('Path', ['A', 'B']);
      if (system.includes('impartial evaluator')) return EVALUATION_JSON([]); // empty
      return '{}';
    });
    const result = await tot.explore(client, 'm', 8000, 'task');
    expect(result.selected).toBeDefined();
    expect(result.selected.status).toBe('selected');
    // No matching eval -> default score 50
    expect(result.explored.every((p) => p.evaluation.score === 50)).toBe(true);
  });

  it('handles failed explorations gracefully (empty/failed responses)', async () => {
    const tot = makeExplorer();
    const client = fakeClient(() => 'not json at all');
    const result = await tot.explore(client, 'm', 8000, 'task');
    // All paths get fallback approaches
    expect(result.explored).toHaveLength(3);
    for (const p of result.explored) {
      expect(p.approach).toMatch(/^Alternative \d$/);
      expect(p.steps.length).toBeGreaterThan(0);
    }
  });

  it('skips merge phase when enableMerging is false', async () => {
    const tot = new TreeOfThoughts({ numPaths: 2, enableMerging: false });
    const client = evaluatingClient([88, 60], ['select', 'reject']);
    const result = await tot.explore(client, 'm', 8000, 'task');
    expect(result.mergedInsights).toEqual([]);
    expect(result.selected.evaluation.score).toBe(88);
  });

  it('returns no selected path when there are zero paths', async () => {
    const tot = new TreeOfThoughts({ numPaths: 0 });
    const client = fakeClient(() => '{}');
    const result = await tot.explore(client, 'm', 8000, 'task');
    expect(result.explored).toHaveLength(0);
    expect(result.selected).toBeUndefined();
  });
});

describe('TreeOfThoughts parsing', () => {
  it('parses exploration JSON wrapped in a code fence', async () => {
    const tot = new TreeOfThoughts();
    const client = fakeClient((system) => {
      if (system.includes('solution architect')) {
        return '```json\n' + EXPLORE_JSON('Fenced', ['X', 'Y']) + '\n```';
      }
      return '[]';
    });
    const result = await tot.explore(client, 'm', 8000, 't');
    expect(result.explored[0].approach).toBe('Fenced');
    expect(result.explored[0].steps).toEqual(['X', 'Y']);
  });

  it('parses evaluation JSON wrapped in a code fence', async () => {
    const tot = new TreeOfThoughts({ numPaths: 1 });
    const client: LLMClient = {
      stream(params) {
        const system = params.system;
        if (system.includes('solution architect')) return textStream(EXPLORE_JSON('Only', ['A']));
        if (system.includes('impartial evaluator')) {
          const content = params.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const id = [...content.matchAll(/"id"\s*:\s*"([^"]+)"/g)][0][1];
          return textStream('```json\n' + EVALUATION_JSON([{ id, score: 95, recommendation: 'select' }]) + '\n```');
        }
        return textStream('{}');
      },
    };
    const result = await tot.explore(client, 'm', 8000, 't');
    expect(result.selected.evaluation.score).toBe(95);
  });

  it('clamps evaluation scores to the 0-100 range', async () => {
    const tot = new TreeOfThoughts({ numPaths: 1 });
    const client: LLMClient = {
      stream(params) {
        const system = params.system;
        if (system.includes('solution architect')) return textStream(EXPLORE_JSON('Only', ['A']));
        if (system.includes('impartial evaluator')) {
          const content = params.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const id = [...content.matchAll(/"id"\s*:\s*"([^"]+)"/g)][0][1];
          return textStream(EVALUATION_JSON([{ id, score: 999, recommendation: 'select' }]));
        }
        return textStream('{}');
      },
    };
    const result = await tot.explore(client, 'm', 8000, 't');
    expect(result.selected.evaluation.score).toBe(100);
  });

  it('keeps the original path when evaluation data has no match for its id', async () => {
    const tot = new TreeOfThoughts({ numPaths: 1 });
    const client = fakeClient((system) => {
      if (system.includes('solution architect')) return EXPLORE_JSON('Only', ['A']);
      if (system.includes('impartial evaluator')) {
        return EVALUATION_JSON([{ id: 'other-id', score: 10, recommendation: 'reject' }]);
      }
      return '{}';
    });
    const result = await tot.explore(client, 'm', 8000, 't');
    // The single path is still selected (fallback), so its status flips to 'selected'
    expect(result.selected).toBeDefined();
    expect(result.explored[0].evaluation.score).toBe(50);
    expect(result.explored[0].status).toBe('selected');
  });
});

describe('TreeOfThoughts selection', () => {
  it('prefers the highest-scoring non-rejected path', async () => {
    const tot = new TreeOfThoughts();
    const paths = [
      {
        id: 'p1',
        approach: 'A',
        steps: [],
        evaluation: { score: 40, strengths: [], weaknesses: [], risks: [], recommendation: 'reject' as const },
        result: '',
        status: 'exploring' as const,
      },
      {
        id: 'p2',
        approach: 'B',
        steps: [],
        evaluation: { score: 99, strengths: [], weaknesses: [], risks: [], recommendation: 'select' as const },
        result: '',
        status: 'exploring' as const,
      },
      {
        id: 'p3',
        approach: 'C',
        steps: [],
        evaluation: { score: 80, strengths: [], weaknesses: [], risks: [], recommendation: 'merge' as const },
        result: '',
        status: 'exploring' as const,
      },
    ];
    // Access private method via any cast for white-box coverage of selection logic
    const selected = (tot as unknown as { selectBestPath(p: typeof paths): (typeof paths)[0] | null }).selectBestPath(
      paths,
    );
    expect(selected?.id).toBe('p2');
    expect(selected?.status).toBe('selected');
  });

  it('falls back to highest score when all are rejected', async () => {
    const tot = new TreeOfThoughts();
    const paths = [
      {
        id: 'p1',
        approach: 'A',
        steps: [],
        evaluation: { score: 30, strengths: [], weaknesses: [], risks: [], recommendation: 'reject' as const },
        result: '',
        status: 'exploring' as const,
      },
      {
        id: 'p2',
        approach: 'B',
        steps: [],
        evaluation: { score: 55, strengths: [], weaknesses: [], risks: [], recommendation: 'reject' as const },
        result: '',
        status: 'exploring' as const,
      },
    ];
    const selected = (tot as unknown as { selectBestPath(p: typeof paths): (typeof paths)[0] | null }).selectBestPath(
      paths,
    );
    expect(selected?.id).toBe('p2');
  });

  it('returns null for an empty path list', async () => {
    const tot = new TreeOfThoughts();
    const selected = (tot as unknown as { selectBestPath(p: never[]): null }).selectBestPath([]);
    expect(selected).toBeNull();
  });
});

describe('TreeOfThoughts complexity estimation', () => {
  it('gives extra points for long tasks, bullets, and keywords', () => {
    const tot = new TreeOfThoughts({ complexityThreshold: 10 });
    const task = [
      'refactor the database schema for performance and scale',
      '- point a',
      '- point b',
      '- point c',
      'design a distributed concurrent algorithm with consistency and replication concerns',
    ].join('\n');
    // keywords: refactor, database, performance, scale, design, distributed,
    // concurrent, algorithm, consistency, replication = 10; bullets = 3; capped at 10
    expect(tot.shouldUseToT(task)).toBe(true);
  });

  it('returns false for empty/short tasks', () => {
    const tot = new TreeOfThoughts({ complexityThreshold: 1 });
    expect(tot.shouldUseToT('')).toBe(false);
    expect(tot.shouldUseToT('hi')).toBe(false);
  });

  it('counts bullet points up to a maximum of 3', () => {
    const tot = new TreeOfThoughts({ complexityThreshold: 3 });
    const bullets = Array.from({ length: 20 }, (_, i) => `- item ${i}`).join('\n');
    // 20 bullets would give 20 points, capped at 3
    expect(tot.shouldUseToT(bullets)).toBe(true);
  });
});

describe('TreeOfThoughts.formatResult', () => {
  it('marks the selected path and lists all paths', () => {
    const tot = new TreeOfThoughts();
    const result: TreeOfThoughtsResult = {
      task: 't',
      explored: [
        {
          id: 'p1',
          approach: 'Main',
          steps: ['S1'],
          evaluation: { score: 90, strengths: ['x'], weaknesses: [], risks: [], recommendation: 'select' as const },
          result: '',
          status: 'selected' as const,
        },
        {
          id: 'p2',
          approach: 'Alt',
          steps: ['S2'],
          evaluation: { score: 50, strengths: [], weaknesses: [], risks: [], recommendation: 'reject' as const },
          result: '',
          status: 'evaluated' as const,
        },
      ],
      selected: {
        id: 'p1',
        approach: 'Main',
        steps: ['S1'],
        evaluation: { score: 90, strengths: ['x'], weaknesses: [], risks: [], recommendation: 'select' as const },
        result: '',
        status: 'selected' as const,
      },
      mergedInsights: [],
      summary: 'Summary line',
    };
    const out = tot.formatResult(result);
    expect(out).toContain('Main');
    expect(out).toContain('Alt');
    expect(out).toContain('90/100');
    expect(out).toContain('Recommended Plan');
    expect(out).toContain('Summary line');
  });
});
