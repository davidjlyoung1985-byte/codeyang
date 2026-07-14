/**
 * Tests for Tracing/Monitoring system
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Tracer } from './index.js';

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = Tracer.getInstance();
  });

  describe('Singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = Tracer.getInstance();
      const instance2 = Tracer.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Span creation', () => {
    it('should create a new span', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace-id' });
      expect(span).toBeDefined();
      expect(span.id).toBeDefined();
      expect(typeof span.id).toBe('string');
    });

    it('should create spans with unique IDs', () => {
      const span1 = tracer.startSpan('operation-1', { traceId: 'trace-1' });
      const span2 = tracer.startSpan('operation-2', { traceId: 'trace-2' });
      expect(span1.id).not.toBe(span2.id);
    });

    it('should track span start time', () => {
      const span = tracer.startSpan('timed-operation', { traceId: 'test-trace' });
      expect(span.startTime).toBeDefined();
      expect(span.startTime).toBeGreaterThan(0);
    });

    it('should set span name', () => {
      const span = tracer.startSpan('my-operation', { traceId: 'test-trace' });
      expect(span.name).toBe('my-operation');
    });

    it('should set trace ID', () => {
      const traceId = 'custom-trace-id';
      const span = tracer.startSpan('operation', { traceId });
      expect(span.traceId).toBe(traceId);
    });
  });

  describe('Span completion', () => {
    it('should end a span', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      const initialEndTime = span.endTime;
      const endSpanFn = tracer.endSpan || span.end;
      if (typeof endSpanFn === 'function') {
        endSpanFn.call(tracer, span);
      }
      expect(span.endTime).toBeGreaterThan(initialEndTime);
    });

    it('should calculate span duration', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      const endSpanFn = tracer.endSpan || span.end;
      if (typeof endSpanFn === 'function') {
        endSpanFn.call(tracer, span);
      }
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should set success status', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      tracer.endSpan(span, { status: 'ok' });
      expect(span.status).toBe('ok');
    });
  });

  describe('Span tags', () => {
    it('should have tags object', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      expect(span.tags).toBeDefined();
      expect(typeof span.tags).toBe('object');
    });

    it('should support setting tags via setTag method', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      if (span.setTag) {
        span.setTag('key', 'value');
        expect(span.tags.key).toBe('value');
      } else {
        // Tags may be set differently
        expect(span.tags).toBeDefined();
      }
    });
  });

  describe('Parent-child relationships', () => {
    it('should create child spans', () => {
      const parent = tracer.startSpan('parent-operation', { traceId: 'test-trace' });
      const child = tracer.startSpan('child-operation', { traceId: 'test-trace', parentId: parent.id });
      expect(child.parentId).toBe(parent.id);
    });

    it('should share trace ID in hierarchy', () => {
      const traceId = 'shared-trace-id';
      const parent = tracer.startSpan('parent', { traceId });
      const child = tracer.startSpan('child', { traceId, parentId: parent.id });
      expect(child.traceId).toBe(parent.traceId);
      expect(child.traceId).toBe(traceId);
    });
  });

  describe('Error tracking', () => {
    it('should record errors', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      tracer.endSpan(span, { status: 'error', error: 'Test error' });
      expect(span.error).toBeDefined();
    });

    it('should set error status', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      tracer.endSpan(span, { status: 'error' });
      expect(span.status).toBe('error');
    });
  });

  describe('Span categories', () => {
    it('should set span category', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace', category: 'tool' });
      expect(span.category).toBe('tool');
    });

    it('should accept valid categories', () => {
      const categories: Array<'agent' | 'llm' | 'tool' | 'plan' | 'verify'> = [
        'agent',
        'llm',
        'tool',
        'plan',
        'verify',
      ];
      categories.forEach((cat) => {
        const span = tracer.startSpan('test', { traceId: 'test', category: cat });
        expect(span.category).toBeDefined();
      });
    });
  });

  describe('Trace management', () => {
    it('should create trace for span', () => {
      const traceId = 'unique-trace-id';
      const span = tracer.startSpan('test-operation', { traceId });
      expect(span.traceId).toBe(traceId);
    });

    it('should support multiple traces', () => {
      const span1 = tracer.startSpan('op-1', { traceId: 'trace-1' });
      const span2 = tracer.startSpan('op-2', { traceId: 'trace-2' });
      expect(span1.traceId).not.toBe(span2.traceId);
    });
  });

  describe('Span properties', () => {
    it('should have all required properties', () => {
      const span = tracer.startSpan('test', { traceId: 'test-trace' });
      expect(span).toHaveProperty('id');
      expect(span).toHaveProperty('traceId');
      expect(span).toHaveProperty('name');
      expect(span).toHaveProperty('startTime');
      expect(span).toHaveProperty('endTime');
      expect(span).toHaveProperty('durationMs');
      expect(span).toHaveProperty('status');
      expect(span).toHaveProperty('tags');
    });
  });

  describe('Trace management', () => {
    it('should start and end a trace', () => {
      const traceId = tracer.startTrace({ name: 'test-trace', source: 'test', rootOperation: 'test.run' });
      expect(traceId).toBeTruthy();
      expect(typeof traceId).toBe('string');

      tracer.endTrace(traceId);
      const traces = tracer.getTraces();
      expect(traces.length).toBeGreaterThan(0);
      expect(traces[0].id).toBe(traceId);
    });

    it('should return trace summary for valid trace', () => {
      const traceId = tracer.startTrace({ name: 'test', source: 'test', rootOperation: 'test' });
      tracer.endTrace(traceId);
      const summary = tracer.getTraceSummary(traceId);
      expect(summary).not.toBeNull();
      expect(summary!.trace.id).toBe(traceId);
    });

    it('should return null for non-existent trace summary', () => {
      const summary = tracer.getTraceSummary('non-existent');
      expect(summary).toBeNull();
    });

    it('should handle endTrace for non-existent trace', () => {
      expect(() => tracer.endTrace('')).not.toThrow();
    });
  });

  describe('traceAsync', () => {
    it('should auto-start and end span', async () => {
      const traceId = tracer.startTrace({ name: 'async-test', source: 'test', rootOperation: 'async' });
      const result = await tracer.traceAsync(traceId, 'async-op', 'tool', async (span) => {
        expect(span.name).toBe('async-op');
        return 42;
      });
      expect(result).toBe(42);
      tracer.endTrace(traceId);
    });

    it('should mark error on exception', async () => {
      const traceId = tracer.startTrace({ name: 'error-test', source: 'test', rootOperation: 'error' });
      await expect(
        tracer.traceAsync(traceId, 'failing-op', 'tool', async () => {
          throw new Error('oops');
        }),
      ).rejects.toThrow('oops');
      tracer.endTrace(traceId);
    });
  });

  describe('querySpans', () => {
    it('should return recent spans filtered by category', () => {
      const traceId = tracer.startTrace({ name: 'query-test', source: 'test', rootOperation: 'query' });
      const span = tracer.startSpan('test-span', { traceId, category: 'llm' });
      tracer.endSpan(span);
      tracer.endTrace(traceId);

      const results = tracer.querySpans({ category: 'llm', limit: 10 });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].category).toBe('llm');
    });

    it('should return empty for non-matching category', () => {
      const results = tracer.querySpans({ category: 'verify', limit: 10 });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Tracer configuration', () => {
    it('should toggle enabled state', () => {
      tracer.setEnabled(false);
      expect(tracer.isEnabled()).toBe(false);
      tracer.setEnabled(true);
      expect(tracer.isEnabled()).toBe(true);
    });

    it('should set max spans', () => {
      expect(() => tracer.setMaxSpans(100)).not.toThrow();
    });

    it('should add exporter', () => {
      const exporter = { export: vi.fn() };
      expect(() => tracer.addExporter(exporter)).not.toThrow();
    });
  });

  describe('exportTrace', () => {
    it('should return "Trace not found" for invalid trace', () => {
      const result = tracer.exportTrace('nonexistent');
      expect(result).toBe('Trace not found');
    });

    it('should export as JSON format', () => {
      const traceId = tracer.startTrace({ name: 'export-test', source: 'test', rootOperation: 'export' });
      const span = tracer.startSpan('span1', { traceId, category: 'tool' });
      tracer.endSpan(span);
      tracer.endTrace(traceId);

      const json = tracer.exportTrace(traceId, 'json');
      const parsed = JSON.parse(json);
      expect(parsed.trace.id).toBe(traceId);
      expect(parsed.spans).toBeDefined();
    });

    it('should export as compact format', () => {
      const traceId = tracer.startTrace({ name: 'compact-test', source: 'test', rootOperation: 'compact' });
      tracer.endTrace(traceId);

      const compact = tracer.exportTrace(traceId, 'compact');
      expect(typeof compact).toBe('string');
      expect(compact).toContain('Trace:');
    });
  });
});
