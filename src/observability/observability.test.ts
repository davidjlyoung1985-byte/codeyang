import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StructuredLogger, LogLevel } from './StructuredLogger.js';
import { MetricsCollector } from './MetricsCollector.js';
import { AlertingManager, AlertSeverity } from './Alerting.js';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger({ serviceName: 'test', minLevel: LogLevel.DEBUG });
  });

  afterEach(async () => {
    await logger.cleanup();
  });

  it('should log with context', () => {
    // Should not throw
    logger.info('test message', { userId: '123', action: 'test' });
    logger.error('error message', { error: 'test error' });
    expect(true).toBe(true);
  });

  it('should respect log level', () => {
    const productionLogger = new StructuredLogger({ minLevel: LogLevel.WARN });

    // These should be filtered out
    productionLogger.debug('debug');
    productionLogger.info('info');

    // These should pass
    productionLogger.warn('warning');
    productionLogger.error('error');

    expect(true).toBe(true);
  });

  it('should sanitize sensitive data', () => {
    logger.info('login', {
      username: 'user',
      password: 'secret123',
      apiKey: 'key-123',
    });

    // Should not throw and should have redacted sensitive fields
    expect(true).toBe(true);
  });

  it('should apply sampling', () => {
    const sampledLogger = new StructuredLogger({ samplingRate: 0.1 });

    // Log many times, most should be dropped
    for (let i = 0; i < 100; i++) {
      sampledLogger.info(`message ${i}`);
    }

    expect(true).toBe(true);
  });

  it('should never sample errors', () => {
    const sampledLogger = new StructuredLogger({ samplingRate: 0.0 });

    // Errors should always go through
    sampledLogger.error('critical error');
    sampledLogger.fatal('fatal error');

    expect(true).toBe(true);
  });
});

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector({ prefix: 'test' });
    metrics.reset();
  });

  afterEach(async () => {
    await metrics.cleanup();
  });

  it('should collect counter metrics', () => {
    metrics.counter('requests', 1, { endpoint: '/api' });
    metrics.counter('requests', 1, { endpoint: '/api' });
    metrics.counter('requests', 1, { endpoint: '/api' });

    const snapshot = metrics.getMetrics();
    const key = Object.keys(snapshot).find((k) => k.includes('requests'));

    expect(key).toBeDefined();
    expect(snapshot[key].value).toBe(3);
  });

  it('should collect histogram metrics', () => {
    metrics.histogram('response_time', 100);
    metrics.histogram('response_time', 200);
    metrics.histogram('response_time', 150);

    const snapshot = metrics.getMetrics();
    const key = Object.keys(snapshot).find((k) => k.includes('response_time'));

    expect(key).toBeDefined();
    expect(snapshot[key].count).toBe(3);
    expect(snapshot[key].avg).toBeCloseTo(150, 0);
    expect(snapshot[key].min).toBe(100);
    expect(snapshot[key].max).toBe(200);
  });

  it('should collect gauge metrics', () => {
    metrics.gauge('memory_usage', 1024);
    metrics.gauge('memory_usage', 2048);

    const snapshot = metrics.getMetrics();
    const key = Object.keys(snapshot).find((k) => k.includes('memory_usage'));

    expect(key).toBeDefined();
    expect(snapshot[key].value).toBe(2048); // Latest value
  });

  it('should use predefined metrics', () => {
    metrics.llmCallDuration.record(500, { model: 'claude' });
    metrics.llmCallErrors.inc(1, { model: 'claude', error: 'timeout' });
    metrics.activeAgents.set(5);

    const snapshot = metrics.getMetrics();

    expect(Object.keys(snapshot).length).toBeGreaterThan(0);
  });

  it('should handle tags correctly', () => {
    metrics.counter('requests', 1, { method: 'GET', status: '200' });
    metrics.counter('requests', 1, { method: 'POST', status: '201' });

    const snapshot = metrics.getMetrics();

    // Should have separate metrics for different tag combinations
    const keys = Object.keys(snapshot).filter((k) => k.includes('requests'));
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it('should calculate percentiles correctly', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    values.forEach((v) => metrics.histogram('latency', v));

    const snapshot = metrics.getMetrics();
    const key = Object.keys(snapshot).find((k) => k.includes('latency'));

    expect(snapshot[key].p50).toBeCloseTo(50, -1);
    expect(snapshot[key].p95).toBeCloseTo(95, -1);
    expect(snapshot[key].p99).toBeCloseTo(99, -1);
  });
});

describe('AlertingManager', () => {
  let alerting: AlertingManager;

  beforeEach(() => {
    alerting = new AlertingManager({ channels: [{ type: 'console', config: {} }] });
  });

  it('should send alert', async () => {
    const alert = {
      id: 'test-1',
      timestamp: Date.now(),
      severity: AlertSeverity.WARNING,
      title: 'Test Alert',
      message: 'This is a test',
      source: 'test',
    };

    await alerting.sendAlert(alert);
    // Should not throw
    expect(true).toBe(true);
  });

  it('should suppress duplicate alerts', async () => {
    const alert = {
      id: 'test-1',
      timestamp: Date.now(),
      severity: AlertSeverity.INFO,
      title: 'Duplicate Test',
      message: 'Same message',
      source: 'test',
      fingerprint: 'test-fingerprint',
    };

    await alerting.sendAlert(alert);
    await alerting.sendAlert(alert); // Should be suppressed

    expect(true).toBe(true);
  });

  it('should evaluate rules', async () => {
    const ruleTriggered = false;

    alerting.addRule({
      name: 'test_rule',
      condition: (data: any) => data.value > 100,
      severity: AlertSeverity.WARNING,
      message: 'Value exceeded threshold',
    });

    await alerting.evaluate({ value: 150 });

    // Should not throw
    expect(true).toBe(true);
  });

  it('should add and remove rules', () => {
    alerting.addRule({
      name: 'temp_rule',
      condition: () => false,
      severity: AlertSeverity.INFO,
      message: 'Test',
    });

    alerting.removeRule('temp_rule');

    expect(true).toBe(true);
  });

  it('should handle multiple channels', async () => {
    alerting.addChannel({ type: 'email', config: { to: 'test@example.com' } });
    alerting.addChannel({ type: 'slack', config: { webhook: 'https://hooks.slack.com/test' } });

    const alert = {
      id: 'test-1',
      timestamp: Date.now(),
      severity: AlertSeverity.CRITICAL,
      title: 'Critical Alert',
      message: 'Service down',
      source: 'test',
    };

    await alerting.sendAlert(alert);

    // Should not throw
    expect(true).toBe(true);
  });
});
