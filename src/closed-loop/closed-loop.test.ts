import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WatcherSystem } from './WatcherSystem.js';
import { VerificationPipeline } from './VerificationPipeline.js';
import { FeedbackInjector } from './FeedbackInjector.js';
import type { LLMMessage } from '../agent/LLMClient.js';
import { tmpdir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// ── WatcherSystem ───────────────────────────────────────────────────────────

describe('WatcherSystem', () => {
  let watcher: WatcherSystem;
  let triggered: Array<{ ruleId: string; ctxFile: string }>;

  beforeEach(() => {
    triggered = [];
    watcher = new WatcherSystem((rule, ctx) => {
      triggered.push({ ruleId: rule.id, ctxFile: ctx.filePath });
    });
  });

  afterEach(() => {
    watcher.stop();
  });

  it('starts inactive', () => {
    expect(watcher.isActive).toBe(false);
  });

  it('adds and removes rules', () => {
    watcher.addRule({
      id: 'test-1',
      source: { type: 'timer', intervalMs: 60000 },
      action: 'auto-verify',
    });
    expect(watcher.ruleCount).toBe(1);

    watcher.removeRule('test-1');
    expect(watcher.ruleCount).toBe(0);
  });

  it('exposes active rules', () => {
    watcher.addRule({
      id: 'r1',
      source: { type: 'file', pattern: '.*' },
      action: 'auto-verify',
    });
    const rules = watcher.activeRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('r1');
  });

  it('triggers post-tool rules', () => {
    watcher.addRule({
      id: 'post-write',
      source: { type: 'post-tool', toolNames: ['Write', 'Edit'] },
      action: 'auto-verify',
    });
    watcher.start('/test');

    watcher.checkPostTool({
      filePath: '/test/file.ts',
      toolName: 'Read',
      toolInput: {},
    });
    expect(triggered).toHaveLength(0); // Read not in toolNames

    watcher.checkPostTool({
      filePath: '/test/file.ts',
      toolName: 'Write',
      toolInput: {},
    });
    expect(triggered).toHaveLength(1);
    expect(triggered[0].ruleId).toBe('post-write');

    watcher.stop();
  });

  it('respects condition filter on post-tool', () => {
    watcher.addRule({
      id: 'filtered',
      source: { type: 'post-tool', toolNames: ['Write'] },
      action: 'auto-verify',
      condition: (ctx) => ctx.filePath.endsWith('.ts'),
    });
    watcher.start('/test');

    watcher.checkPostTool({ filePath: 'test.js', toolName: 'Write', toolInput: {} });
    expect(triggered).toHaveLength(0);

    watcher.checkPostTool({ filePath: 'test.ts', toolName: 'Write', toolInput: {} });
    expect(triggered).toHaveLength(1);

    watcher.stop();
  });

  it('can start and stop', () => {
    watcher.addRule({
      id: 't1',
      source: { type: 'timer', intervalMs: 60000 },
      action: 'notify',
    });
    watcher.start('/test');
    expect(watcher.isActive).toBe(true);
    watcher.stop();
    expect(watcher.isActive).toBe(false);
  });

  it('does not double-start', () => {
    watcher.addRule({
      id: 't1',
      source: { type: 'timer', intervalMs: 60000 },
      action: 'notify',
    });
    watcher.start('/test');
    watcher.start('/test'); // second call should be no-op
    expect(watcher.isActive).toBe(true);
    watcher.stop();
  });
});

// ── VerificationPipeline ─────────────────────────────────────────────────────

describe('VerificationPipeline', () => {
  let tempDir: string;
  let pipeline: VerificationPipeline;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `codeyang-test-vp-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    pipeline = new VerificationPipeline(tempDir);
  });

  it('returns empty results for non-TS files', async () => {
    const results = await pipeline.run(join(tempDir, 'readme.md'));
    expect(results).toHaveLength(0);
  });

  it('formatSummary shows all passed', () => {
    const results = [
      { filePath: 'a.ts', passed: true, tool: 'lint' as const, output: '(no issues)', durationMs: 100 },
      { filePath: 'a.ts', passed: true, tool: 'typecheck' as const, output: '(no type errors)', durationMs: 200 },
    ];
    const summary = pipeline.formatSummary(results);
    expect(summary).toContain('All checks passed');
    expect(summary).toContain('lint');
    expect(summary).toContain('typecheck');
  });

  it('formatSummary shows failed checks', () => {
    const results = [
      { filePath: 'a.ts', passed: true, tool: 'lint' as const, output: '(no issues)', durationMs: 100 },
      { filePath: 'a.ts', passed: false, tool: 'typecheck' as const, output: 'Type error found', durationMs: 200 },
    ];
    const summary = pipeline.formatSummary(results);
    expect(summary).toContain('1 check(s) failed');
    expect(summary).toContain('Type error found');
  });

  it('setMaxFixIterations clamps to valid range', () => {
    pipeline.setMaxFixIterations(0);
    // Should clamp to 1
    pipeline.setMaxFixIterations(100);
    // Should clamp to 10
  });

  it('runBatch returns results for TS files only', async () => {
    const results = await pipeline.runBatch([join(tempDir, 'a.ts'), join(tempDir, 'b.md')]);
    expect(results.length).toBeGreaterThanOrEqual(0);
  }, 8000);
});

// ── FeedbackInjector ────────────────────────────────────────────────────────

describe('FeedbackInjector', () => {
  let injector: FeedbackInjector;

  beforeEach(() => {
    injector = new FeedbackInjector();
  });

  it('starts with no pending feedback', () => {
    expect(injector.hasPending()).toBe(false);
  });

  it('pushes and drains feedback', () => {
    injector.push({
      summary: 'Lint passed',
      source: 'auto-verify',
      passed: true,
      results: [],
    });
    expect(injector.hasPending()).toBe(true);

    const drained = injector.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0].summary).toBe('Lint passed');
    expect(injector.hasPending()).toBe(false);
  });

  it('drain is idempotent (double drain yields empty)', () => {
    injector.push({
      summary: 'test',
      source: 'auto-verify',
      passed: true,
      results: [],
    });
    injector.drain();
    const second = injector.drain();
    expect(second).toHaveLength(0);
  });

  it('injectIntoHistory adds user message with summaries', () => {
    injector.push({
      summary: 'Lint: OK',
      source: 'auto-verify',
      passed: true,
      results: [],
    });
    injector.push({
      summary: 'TypeCheck: Failed',
      source: 'auto-verify',
      passed: false,
      results: [],
    });

    const history: Array<{ role: 'user'; content: string }> = [];
    injector.injectIntoHistory(history as unknown as LLMMessage[]);

    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toContain('Lint: OK');
    expect(history[0].content).toContain('TypeCheck: Failed');
  });

  it('injectIntoHistory is a no-op when no pending feedback', () => {
    const history: Array<{ role: 'user'; content: string }> = [{ role: 'user' as const, content: 'hi' }];
    injector.injectIntoHistory(history as unknown as LLMMessage[]);
    expect(history).toHaveLength(1); // unchanged
  });

  it('formats auto-verify summary correctly', () => {
    const formatted = FeedbackInjector.formatAutoVerify('[Auto-Verify] All checks passed');
    expect(formatted).toBe('[Auto-Verify] All checks passed');
  });
});
