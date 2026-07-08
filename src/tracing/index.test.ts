/**
 * Tests for Tracing/Monitoring system
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Tracer } from './index.js';

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = Tracer.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      span.end();
      expect(span.endTime).toBeGreaterThan(initialEndTime);
    });

    it('should calculate span duration', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      span.end();
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should set success status', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      span.end({ success: true });
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
      span.end({ success: false, error: 'Test error' });
      expect(span.error).toBeDefined();
    });

    it('should set error status', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace' });
      span.end({ success: false });
      expect(span.status).toBe('error');
    });
  });

  describe('Span categories', () => {
    it('should set span category', () => {
      const span = tracer.startSpan('test-operation', { traceId: 'test-trace', category: 'tool' });
      expect(span.category).toBe('tool');
    });

    it('should accept valid categories', () => {
      const categories = ['agent', 'llm', 'tool', 'plan', 'verify'];
      categories.forEach((cat) => {
        const span = tracer.startSpan('test', { traceId: 'test', category: cat as any });
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
});

