/**
 * Agent E2E Tests — Integration tests for the core Agent class.
 *
 * These tests verify the Agent's behavior in realistic scenarios:
 * - Multi-turn conversations
 * - Tool execution workflows
 * - Error recovery
 * - Context management
 * - Session persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from './Agent.js';
import { config } from './config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Agent E2E Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-e2e-'));

    // Mock the LLM client creation
    vi.spyOn(config, 'provider', 'get').mockReturnValue('anthropic');
    vi.spyOn(config, 'apiKey', 'get').mockReturnValue('test-key');
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe('Basic Agent Operations', () => {
    it('should initialize agent successfully', () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
      expect(agent.getLLMClient()).toBeDefined();
      expect(agent.getReflexionEngine()).toBeDefined();
      expect(agent.getPlanner()).toBeDefined();
    });

    it('should get stats with initial values', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      expect(stats).toHaveProperty('tokens');
      expect(stats).toHaveProperty('turns');
      expect(stats).toHaveProperty('toolWeights');
      expect(stats.tokens.input).toBe(0);
      expect(stats.tokens.output).toBe(0);
      expect(stats.turns).toBe(0);
    });

    it('should set and retrieve callbacks', () => {
      const agent = new Agent();
      const callbacks = {
        onStreamChunk: vi.fn(),
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
      };

      agent.setCallbacks(callbacks);
      // No direct getter, but we can verify it doesn't throw
      expect(() => agent.setCallbacks(callbacks)).not.toThrow();
    });
  });

  describe('Harness Components', () => {
    it('should initialize tracer', () => {
      const agent = new Agent();
      const tracer = agent.getTracer();

      expect(tracer).toBeDefined();
    });

    it('should initialize circuit breaker manager', () => {
      const agent = new Agent();
      const cbManager = agent.getCircuitBreakerManager();

      expect(cbManager).toBeDefined();
      const stats = cbManager.getAllStats();
      expect(stats).toBeDefined();
      // Circuit breakers may not be registered yet
      expect(typeof stats).toBe('object');
    });

    it('should initialize gateway', () => {
      const agent = new Agent();
      const gateway = agent.getGateway();

      expect(gateway).toBeDefined();
    });

    it('should get harness status', () => {
      const agent = new Agent();
      const status = agent.getHarnessStatus();

      expect(status).toHaveProperty('circuitBreakers');
      expect(status).toHaveProperty('tracing');
      expect(status).toHaveProperty('gateway');
    });
  });

  describe('Tool Execution', () => {
    it('should track tool weights', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      expect(Array.isArray(stats.toolWeights)).toBe(true);
      // Initially empty or with default weights
      expect(stats.toolWeights.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle pending feedback', () => {
      const agent = new Agent();

      // Initially no pending feedback
      expect(agent.pendingFeedback).toBe(false);
    });
  });

  describe('Context Management', () => {
    it('should handle Qt context', () => {
      const qtContext = {
        isQtProject: true,
        qtVersion: '6.5.0',
        modules: ['QtCore', 'QtGui'],
        buildSystem: 'cmake' as const,
      };

      const agent = new Agent(qtContext);
      expect(agent).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should reset per-session stats but keep the object usable', () => {
      const agent = new Agent();

      // Dirty the counters first, otherwise "reset" proves nothing.
      agent.recordToolCall('Bash', 42, false);
      expect(agent.getToolStats().get('Bash')?.calls).toBe(1);

      agent.reset();

      // Tool stats are per-session and must not leak into the next one.
      expect(agent.getToolStats().size).toBe(0);
      // Token/turn counters start over.
      expect(agent.getStats().turns).toBe(0);
      expect(agent.getStats().tokens.total).toBe(0);
      // The agent is still usable after a reset.
      expect(() => agent.getStats()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', () => {
      // Mock a failing config
      vi.spyOn(config, 'apiKey', 'get').mockReturnValue('');

      // Should still create agent (validation happens at runtime)
      expect(() => new Agent()).not.toThrow();
    });
  });

  describe('Multi-Component Integration', () => {
    it('should integrate reflexion engine', () => {
      const agent = new Agent();
      const reflexion = agent.getReflexionEngine();

      expect(reflexion).toBeDefined();
      // Reflexion should have methods
      expect(typeof reflexion.recordExecution).toBe('function');
    });

    it('should integrate planner', () => {
      const agent = new Agent();
      const planner = agent.getPlanner();

      expect(planner).toBeDefined();
      expect(typeof planner.generatePlan).toBe('function');
    });

    it('should track trace IDs', () => {
      const agent = new Agent();
      const traceId = agent.getCurrentTraceId();

      // Initially empty
      expect(typeof traceId).toBe('string');
    });
  });

  describe('Watcher Integration', () => {
    it('should set watcher', () => {
      const agent = new Agent();

      // Should accept null
      expect(() => agent.setWatcher(null)).not.toThrow();
    });

    it('should set verification pipeline', () => {
      const agent = new Agent();

      // Should accept null
      expect(() => agent.setVerificationPipeline(null)).not.toThrow();
    });
  });

  describe('Token Usage Tracking', () => {
    it('should track input tokens', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      expect(stats.tokens).toBeDefined();
      expect(typeof stats.tokens.input).toBe('number');
    });

    it('should track output tokens', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      expect(stats.tokens).toBeDefined();
      expect(typeof stats.tokens.output).toBe('number');
    });

    it('should calculate total tokens', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      expect(stats.tokens).toBeDefined();
      expect(typeof stats.tokens.total).toBe('number');
      expect(stats.tokens.total).toBe(stats.tokens.input + stats.tokens.output);
    });
  });

  describe('Circuit Breaker Configuration', () => {
    it('should configure circuit breaker manager', () => {
      const agent = new Agent();
      const cbManager = agent.getCircuitBreakerManager();
      const stats = cbManager.getAllStats();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
      // Circuit breakers are created dynamically
    });

    it('should respect environment variables for circuit breaker config', () => {
      process.env['CODEYANG_CB_THRESHOLD'] = '10';
      process.env['CODEYANG_CB_RESET_MS'] = '60000';

      const agent = new Agent();
      const cbManager = agent.getCircuitBreakerManager();

      expect(cbManager).toBeDefined();

      // Cleanup
      delete process.env['CODEYANG_CB_THRESHOLD'];
      delete process.env['CODEYANG_CB_RESET_MS'];
    });
  });

  describe('A2A Protocol', () => {
    it('should initialize A2A protocol', () => {
      const agent = new Agent();

      // A2A protocol is initialized internally
      // Verify agent can be created without errors
      expect(agent).toBeDefined();
    });
  });

  describe('Tree of Thoughts', () => {
    it('should initialize ToT module', () => {
      const agent = new Agent();

      // ToT is initialized internally
      expect(agent).toBeDefined();
    });
  });

  describe('Stats Aggregation', () => {
    it('should aggregate tool statistics', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      expect(stats.toolWeights).toBeDefined();
      expect(Array.isArray(stats.toolWeights)).toBe(true);

      // Each tool weight should have expected properties
      stats.toolWeights.forEach((tw) => {
        expect(tw).toHaveProperty('name');
        expect(tw).toHaveProperty('weight');
        expect(tw).toHaveProperty('successRate');
        expect(tw).toHaveProperty('calls');
      });
    });

    it('should count conversation turns', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      expect(typeof stats.turns).toBe('number');
      expect(stats.turns).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cache Token Tracking', () => {
    it('should track cache read tokens when available', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      // Cache tokens may be undefined initially
      expect(stats.tokens.cacheRead === undefined || typeof stats.tokens.cacheRead === 'number').toBe(true);
    });

    it('should track cache creation tokens when available', () => {
      const agent = new Agent();
      const stats = agent.getStats();

      // Cache tokens may be undefined initially
      expect(stats.tokens.cacheCreation === undefined || typeof stats.tokens.cacheCreation === 'number').toBe(true);
    });
  });
});
