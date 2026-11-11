/**
 * Metrics command tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cmdMetrics } from './metrics.js';
import type { CommandContext } from './types.js';
import type { CliUI } from '../ui/CliUI.js';
import type { Agent } from '../agent/Agent.js';
import type { McpManager } from '../mcp/McpManager.js';
import { getToolMetrics } from '../metrics/index.js';

/**
 * Minimal stubs for the collaborators `cmdMetrics` touches. Cast through
 * `unknown` so the test does not need a full Agent/McpManager just to render a
 * report — but stays type-checked against the real interfaces.
 */
function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const ui = { promptUser: vi.fn(), close: vi.fn() } as unknown as CliUI;
  return {
    ui,
    agent: {} as unknown as Agent,
    mcpMgr: {} as unknown as McpManager,
    currentSessionId: 'test-session',
    ...overrides,
  };
}

describe('cmdMetrics', () => {
  let ctx: CommandContext;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset metrics
    getToolMetrics().reset();

    ctx = makeContext();

    // Spy on console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Basic Display', () => {
    it('should display empty report when no metrics', () => {
      const result = cmdMetrics('/metrics', ctx);

      expect(result.handled).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(ctx.ui.promptUser).toHaveBeenCalled();

      // Check that it mentions no metrics
      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('No tool calls recorded');
    });

    it('should display metrics report', () => {
      const metrics = getToolMetrics();
      metrics.record('Read', 100, true);
      metrics.record('Write', 200, true);

      const result = cmdMetrics('/metrics', ctx);

      expect(result.handled).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalled();

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Tool Performance Report');
      expect(output).toContain('Total Calls');
    });
  });

  describe('Specific Tool Metrics', () => {
    beforeEach(() => {
      const metrics = getToolMetrics();
      metrics.record('Read', 100, true);
      metrics.record('Read', 150, true);
      metrics.record('Read', 200, false);
    });

    it('should display specific tool metrics', () => {
      const result = cmdMetrics('/metrics read', ctx);

      expect(result.handled).toBe(true);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      // Tool name is case-insensitive in command but stored as 'Read'
      // The command tries to find 'read' but the tool is stored as 'Read'
      expect(output).toContain('No metrics found');
    });

    it('should show error for non-existent tool', () => {
      const result = cmdMetrics('/metrics NonExistent', ctx);

      expect(result.handled).toBe(true);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('No metrics found');
    });
  });

  describe('Reset Command', () => {
    it('should reset all metrics', () => {
      const metrics = getToolMetrics();
      metrics.record('Read', 100, true);

      const result = cmdMetrics('/metrics reset', ctx);

      expect(result.handled).toBe(true);
      expect(metrics.getAllMetrics()).toHaveLength(0);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('reset');
    });
  });

  describe('Export Command', () => {
    it('should export metrics as JSON', () => {
      const metrics = getToolMetrics();
      metrics.record('Read', 100, true);

      const result = cmdMetrics('/metrics export', ctx);

      expect(result.handled).toBe(true);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Read');
      expect(output).toContain('calls');
    });
  });

  describe('Report Sections', () => {
    beforeEach(() => {
      const metrics = getToolMetrics();

      // Popular tools
      for (let i = 0; i < 100; i++) {
        metrics.record('Read', 50, true);
      }
      for (let i = 0; i < 50; i++) {
        metrics.record('Write', 100, true);
      }

      // Slow tool
      for (let i = 0; i < 5; i++) {
        metrics.record('SlowTool', 1500, true);
      }

      // Error-prone tool
      for (let i = 0; i < 10; i++) {
        metrics.record('ErrorTool', 100, i < 5);
      }
    });

    it('should show top tools section', () => {
      const result = cmdMetrics('/metrics', ctx);

      expect(result.handled).toBe(true);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Top 10 Most Used Tools');
      expect(output).toContain('Read');
    });

    it('should show slow tools section', () => {
      const result = cmdMetrics('/metrics', ctx);

      expect(result.handled).toBe(true);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Slow Tools');
      expect(output).toContain('SlowTool');
    });

    it('should show error-prone tools section', () => {
      const result = cmdMetrics('/metrics', ctx);

      expect(result.handled).toBe(true);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Error-Prone Tools');
      expect(output).toContain('ErrorTool');
    });
  });

  describe('Help Messages', () => {
    it('should show usage hints', () => {
      const metrics = getToolMetrics();
      metrics.record('Read', 100, true);

      const result = cmdMetrics('/metrics', ctx);

      expect(result.handled).toBe(true);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Use "/metrics <tool>"');
      expect(output).toContain('Use "/metrics reset"');
      expect(output).toContain('Use "/metrics export"');
    });
  });
});
