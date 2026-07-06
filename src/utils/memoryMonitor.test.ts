import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMemoryUsage, getHeapStatistics, createMemorySnapshot, MemoryMonitor, forceGC } from './memoryMonitor.js';

describe('Memory Monitor', () => {
  describe('getMemoryUsage', () => {
    it('should return memory stats', () => {
      const stats = getMemoryUsage();

      expect(stats.rss).toMatch(/^\d+MB$/);
      expect(stats.heapTotal).toMatch(/^\d+MB$/);
      expect(stats.heapUsed).toMatch(/^\d+MB$/);
      expect(stats.external).toMatch(/^\d+MB$/);
      expect(stats.heapUsedPercent).toBeGreaterThan(0);
      expect(stats.heapUsedPercent).toBeLessThanOrEqual(100);
      expect(stats.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getHeapStatistics', () => {
    it('should return V8 heap statistics', () => {
      const stats = getHeapStatistics();

      expect(stats.totalHeapSize).toMatch(/^\d+MB$/);
      expect(stats.usedHeapSize).toMatch(/^\d+MB$/);
      expect(stats.heapSizeLimit).toMatch(/^\d+MB$/);
    });
  });

  describe('createMemorySnapshot', () => {
    it('should create snapshot without baseline', () => {
      const snapshot = createMemorySnapshot();

      expect(snapshot.current).toBeDefined();
      expect(snapshot.baseline).toBeUndefined();
      expect(snapshot.delta).toBeUndefined();
    });

    it('should create snapshot with baseline and delta', () => {
      const baseline = getMemoryUsage();

      // Allocate some memory
      const largeArray = new Array(1000000).fill('x');

      const snapshot = createMemorySnapshot(baseline);

      expect(snapshot.current).toBeDefined();
      expect(snapshot.baseline).toEqual(baseline);
      expect(snapshot.delta).toBeDefined();
      expect(snapshot.delta?.rss).toBeGreaterThanOrEqual(0);

      // Clean up
      largeArray.length = 0;
    });
  });

  describe('MemoryMonitor', () => {
    let monitor: MemoryMonitor;

    beforeEach(() => {
      monitor = new MemoryMonitor(10);
    });

    afterEach(() => {
      monitor.stop();
    });

    it('should take manual samples', () => {
      const stats = monitor.sample();

      expect(stats).toBeDefined();
      expect(monitor.getSamples()).toHaveLength(1);
    });

    it('should limit samples to maxSamples', () => {
      for (let i = 0; i < 15; i++) {
        monitor.sample();
      }

      expect(monitor.getSamples()).toHaveLength(10);
    });

    it('should start and stop automatic monitoring', async () => {
      monitor.start(100);

      await new Promise((resolve) => setTimeout(resolve, 250));

      monitor.stop();

      const samples = monitor.getSamples();
      expect(samples.length).toBeGreaterThanOrEqual(2);
    });

    it('should calculate summary statistics', () => {
      monitor.sample();
      monitor.sample();
      monitor.sample();

      const summary = monitor.getSummary();

      expect(summary).toBeDefined();
      expect(summary?.samples).toBe(3);
      expect(summary?.heapUsed.current).toMatch(/^\d+MB$/);
      expect(summary?.heapUsed.min).toMatch(/^\d+MB$/);
      expect(summary?.heapUsed.max).toMatch(/^\d+MB$/);
      expect(summary?.heapUsed.avg).toMatch(/^\d+MB$/);
    });

    it('should detect memory growth', () => {
      // Not enough samples
      expect(monitor.isMemoryGrowing()).toBe(false);

      // Add samples
      for (let i = 0; i < 20; i++) {
        monitor.sample();
      }

      // Should not be growing significantly in normal operation
      expect(monitor.isMemoryGrowing(10)).toBe(false);
    });

    it('should clear samples', () => {
      monitor.sample();
      monitor.sample();
      expect(monitor.getSamples()).toHaveLength(2);

      monitor.clear();
      expect(monitor.getSamples()).toHaveLength(0);
    });
  });

  describe('forceGC', () => {
    it('should handle gc not available', () => {
      const result = forceGC();
      // Will return false unless --expose-gc flag is set
      expect(typeof result).toBe('boolean');
    });
  });
});
