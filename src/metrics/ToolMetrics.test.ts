/**
 * ToolMetrics Tests — 工具性能监控系统测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ToolMetrics,
  recordToolExecution,
  getToolMetrics,
  getPerformanceReport,
  formatPerformanceReport,
} from './ToolMetrics.js';

describe('ToolMetrics', () => {
  let metrics: ToolMetrics;

  beforeEach(() => {
    metrics = ToolMetrics.getInstance();
    metrics.reset();
    metrics.setEnabled(true);
  });

  afterEach(() => {
    metrics.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ToolMetrics.getInstance();
      const instance2 = ToolMetrics.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Recording Metrics', () => {
    it('should record successful tool execution', () => {
      metrics.record('Read', 100, true);

      const metric = metrics.getToolMetric('Read');
      expect(metric).toBeDefined();
      expect(metric!.calls).toBe(1);
      expect(metric!.totalTime).toBe(100);
      expect(metric!.successCount).toBe(1);
      expect(metric!.errorCount).toBe(0);
    });

    it('should record failed tool execution', () => {
      metrics.record('BashTool', 500, false);

      const metric = metrics.getToolMetric('BashTool');
      expect(metric).toBeDefined();
      expect(metric!.calls).toBe(1);
      expect(metric!.errorCount).toBe(1);
      expect(metric!.successCount).toBe(0);
    });

    it('should aggregate multiple executions', () => {
      metrics.record('Write', 50, true);
      metrics.record('Write', 100, true);
      metrics.record('Write', 150, false);

      const metric = metrics.getToolMetric('Write');
      expect(metric).toBeDefined();
      expect(metric!.calls).toBe(3);
      expect(metric!.totalTime).toBe(300);
      expect(metric!.successCount).toBe(2);
      expect(metric!.errorCount).toBe(1);
    });

    it('should track min and max execution time', () => {
      metrics.record('GitTool', 100, true);
      metrics.record('GitTool', 50, true);
      metrics.record('GitTool', 200, true);

      const metric = metrics.getToolMetric('GitTool');
      expect(metric).toBeDefined();
      expect(metric!.minTime).toBe(50);
      expect(metric!.maxTime).toBe(200);
    });

    it('should update last used timestamp', () => {
      const before = Date.now();
      metrics.record('Edit', 100, true);
      const after = Date.now();

      const metric = metrics.getToolMetric('Edit');
      expect(metric).toBeDefined();
      expect(metric!.lastUsed).toBeGreaterThanOrEqual(before);
      expect(metric!.lastUsed).toBeLessThanOrEqual(after);
    });

    it('should not record when disabled', () => {
      metrics.setEnabled(false);
      metrics.record('Read', 100, true);

      const metric = metrics.getToolMetric('Read');
      expect(metric).toBeNull();
    });
  });

  describe('Calculating Metrics', () => {
    it('should calculate average execution time', () => {
      metrics.record('Read', 100, true);
      metrics.record('Read', 200, true);
      metrics.record('Read', 300, true);

      const metric = metrics.getToolMetric('Read');
      expect(metric!.avgTime).toBe(200);
    });

    it('should calculate success rate', () => {
      metrics.record('BashTool', 100, true);
      metrics.record('BashTool', 100, true);
      metrics.record('BashTool', 100, true);
      metrics.record('BashTool', 100, false);

      const metric = metrics.getToolMetric('BashTool');
      expect(metric!.successRate).toBe(0.75);
    });

    it('should calculate error rate', () => {
      metrics.record('NetworkTool', 100, true);
      metrics.record('NetworkTool', 100, false);
      metrics.record('NetworkTool', 100, false);
      metrics.record('NetworkTool', 100, false);

      const metric = metrics.getToolMetric('NetworkTool');
      expect(metric!.errorRate).toBe(0.75);
    });
  });

  describe('Getting Metrics', () => {
    beforeEach(() => {
      metrics.record('Read', 100, true);
      metrics.record('Write', 200, true);
      metrics.record('Edit', 50, true);
      metrics.record('Read', 150, true);
    });

    it('should get all metrics sorted by calls', () => {
      const allMetrics = metrics.getAllMetrics();

      expect(allMetrics).toHaveLength(3);
      expect(allMetrics[0].tool).toBe('Read');
      expect(allMetrics[0].calls).toBe(2);
    });

    it('should return null for non-existent tool', () => {
      const metric = metrics.getToolMetric('NonExistent');
      expect(metric).toBeNull();
    });
  });

  describe('Performance Report', () => {
    beforeEach(() => {
      // Fast tools
      metrics.record('Read', 50, true);
      metrics.record('Write', 100, true);

      // Slow tool
      for (let i = 0; i < 5; i++) {
        metrics.record('SlowTool', 1500, true);
      }

      // Error-prone tool
      for (let i = 0; i < 10; i++) {
        metrics.record('ErrorTool', 100, i < 5);
      }
    });

    it('should generate complete performance report', () => {
      const report = metrics.getReport();

      expect(report.totalCalls).toBe(17);
      expect(report.tools).toHaveLength(4);
      expect(report.topTools.length).toBeGreaterThan(0);
    });

    it('should identify slow tools', () => {
      const report = metrics.getReport();

      expect(report.slowTools).toHaveLength(1);
      expect(report.slowTools[0].tool).toBe('SlowTool');
    });

    it('should identify error-prone tools', () => {
      const report = metrics.getReport();

      expect(report.errorProneTools).toHaveLength(1);
      expect(report.errorProneTools[0].tool).toBe('ErrorTool');
    });

    it('should list top tools by usage', () => {
      const report = metrics.getReport();

      expect(report.topTools).toBeDefined();
      expect(report.topTools[0].calls).toBeGreaterThanOrEqual(report.topTools[1]?.calls || 0);
    });

    it('should calculate total time correctly', () => {
      const report = metrics.getReport();

      expect(report.totalTime).toBe(50 + 100 + 1500 * 5 + 100 * 10);
    });

    it('should calculate average time correctly', () => {
      const report = metrics.getReport();

      expect(report.avgTime).toBeCloseTo((50 + 100 + 1500 * 5 + 100 * 10) / 17);
    });
  });

  describe('Slow Tools Detection', () => {
    it('should detect slow tools with custom threshold', () => {
      metrics.record('FastTool', 50, true);
      metrics.record('FastTool', 50, true);
      metrics.record('FastTool', 50, true);

      metrics.record('SlowTool', 2000, true);
      metrics.record('SlowTool', 2000, true);
      metrics.record('SlowTool', 2000, true);

      const slowTools = metrics.getSlowTools(1000);

      expect(slowTools).toHaveLength(1);
      expect(slowTools[0].tool).toBe('SlowTool');
    });

    it('should not include tools with few calls', () => {
      metrics.record('SlowTool', 5000, true);
      metrics.record('SlowTool', 5000, true);

      const slowTools = metrics.getSlowTools(1000);

      expect(slowTools).toHaveLength(0);
    });
  });

  describe('Error-Prone Tools Detection', () => {
    it('should detect error-prone tools with custom threshold', () => {
      for (let i = 0; i < 10; i++) {
        metrics.record('ReliableTool', 100, true);
      }

      for (let i = 0; i < 10; i++) {
        metrics.record('UnreliableTool', 100, i < 3);
      }

      const errorProneTools = metrics.getErrorProneTools(0.5);

      expect(errorProneTools).toHaveLength(1);
      expect(errorProneTools[0].tool).toBe('UnreliableTool');
    });

    it('should not include tools with few calls', () => {
      metrics.record('Tool', 100, false);
      metrics.record('Tool', 100, false);

      const errorProneTools = metrics.getErrorProneTools(0.1);

      expect(errorProneTools).toHaveLength(0);
    });
  });

  describe('Reset Operations', () => {
    beforeEach(() => {
      metrics.record('Read', 100, true);
      metrics.record('Write', 100, true);
    });

    it('should reset all metrics', () => {
      metrics.reset();

      const allMetrics = metrics.getAllMetrics();
      expect(allMetrics).toHaveLength(0);
    });

    it('should reset single tool metric', () => {
      metrics.resetTool('Read');

      const readMetric = metrics.getToolMetric('Read');
      const writeMetric = metrics.getToolMetric('Write');

      expect(readMetric).toBeNull();
      expect(writeMetric).toBeDefined();
    });
  });

  describe('Enable/Disable', () => {
    it('should enable metrics collection', () => {
      metrics.setEnabled(true);
      expect(metrics.isEnabled()).toBe(true);
    });

    it('should disable metrics collection', () => {
      metrics.setEnabled(false);
      expect(metrics.isEnabled()).toBe(false);
    });
  });

  describe('Data Export/Import', () => {
    it('should export metrics data', () => {
      metrics.record('Read', 100, true);
      metrics.record('Write', 200, true);

      const exported = metrics.exportData();

      expect(exported).toHaveProperty('Read');
      expect(exported).toHaveProperty('Write');
      expect(exported['Read'].calls).toBe(1);
    });

    it('should import metrics data', () => {
      const data = {
        Read: {
          calls: 5,
          totalTime: 500,
          minTime: 50,
          maxTime: 150,
          successCount: 4,
          errorCount: 1,
          lastUsed: Date.now(),
        },
      };

      metrics.importData(data);

      const metric = metrics.getToolMetric('Read');
      expect(metric).toBeDefined();
      expect(metric!.calls).toBe(5);
      expect(metric!.totalTime).toBe(500);
    });
  });

  describe('Formatted Report', () => {
    beforeEach(() => {
      metrics.record('Read', 100, true);
      metrics.record('Write', 200, true);

      for (let i = 0; i < 5; i++) {
        metrics.record('SlowTool', 1500, true);
      }

      for (let i = 0; i < 10; i++) {
        metrics.record('ErrorTool', 100, i < 5);
      }
    });

    it('should generate formatted report text', () => {
      const report = metrics.formatReport();

      expect(report).toContain('Tool Performance Report');
      expect(report).toContain('Total Calls');
      expect(report).toContain('Top 10 Most Used Tools');
    });

    it('should include slow tools section', () => {
      const report = metrics.formatReport();

      expect(report).toContain('Slow Tools');
      expect(report).toContain('SlowTool');
    });

    it('should include error-prone tools section', () => {
      const report = metrics.formatReport();

      expect(report).toContain('Error-Prone Tools');
      expect(report).toContain('ErrorTool');
    });
  });

  describe('Convenience Functions', () => {
    it('should record via convenience function', () => {
      recordToolExecution('Read', 100, true);

      const metric = metrics.getToolMetric('Read');
      expect(metric).toBeDefined();
      expect(metric!.calls).toBe(1);
    });

    it('should get metrics via convenience function', () => {
      const instance = getToolMetrics();
      expect(instance).toBe(metrics);
    });

    it('should get report via convenience function', () => {
      recordToolExecution('Read', 100, true);

      const report = getPerformanceReport();
      expect(report.totalCalls).toBe(1);
    });

    it('should format report via convenience function', () => {
      recordToolExecution('Read', 100, true);

      const formatted = formatPerformanceReport();
      expect(formatted).toContain('Tool Performance Report');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero calls gracefully', () => {
      const report = metrics.getReport();

      expect(report.totalCalls).toBe(0);
      expect(report.avgTime).toBe(0);
      expect(report.tools).toHaveLength(0);
    });

    it('should handle single execution', () => {
      metrics.record('Read', 100, true);

      const metric = metrics.getToolMetric('Read');
      expect(metric!.avgTime).toBe(100);
      expect(metric!.minTime).toBe(100);
      expect(metric!.maxTime).toBe(100);
    });

    it('should handle very large durations', () => {
      metrics.record('SlowTool', 999999, true);

      const metric = metrics.getToolMetric('SlowTool');
      expect(metric!.totalTime).toBe(999999);
    });

    it('should handle zero duration', () => {
      metrics.record('FastTool', 0, true);

      const metric = metrics.getToolMetric('FastTool');
      expect(metric!.avgTime).toBe(0);
    });
  });
});
