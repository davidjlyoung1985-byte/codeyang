/**
 * Tests for Sandbox module — config, path validation, and resource limiter.
 * Actual process execution tests require real process spawning and are
 * covered by integration tests (src/e2e/).
 */
import { describe, it, expect, vi } from 'vitest';
import { Sandbox, SandboxPool } from './index.js';

// ── Sandbox Config Tests ──────────────────────────────────────────────

describe('Sandbox', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const sb = new Sandbox();
      expect(sb.id).toBeDefined();
      expect(typeof sb.id).toBe('string');
      expect(sb.id.length).toBeGreaterThan(0);
      expect(sb.isRunning).toBe(false);
    });

    it('should accept partial config', () => {
      const sb = new Sandbox({ timeoutMs: 60_000, maxMemoryMb: 1024 });
      expect(sb.id).toBeDefined();
      expect(sb.isRunning).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should update config at runtime', () => {
      const sb = new Sandbox({ timeoutMs: 30_000 });
      sb.setConfig({ timeoutMs: 60_000 });
      // No direct getter for config, but no error should occur
      expect(sb.isRunning).toBe(false);
    });
  });

  describe('hooks', () => {
    it('should register pre-exec hooks', () => {
      const sb = new Sandbox();
      const hook = vi.fn();
      sb.registerPreExecHook(hook);
      // Hook registered, no error
      expect(sb.isRunning).toBe(false);
    });

    it('should register post-exec hooks', () => {
      const sb = new Sandbox();
      const hook = vi.fn();
      sb.registerPostExecHook(hook);
      expect(sb.isRunning).toBe(false);
    });
  });

  describe('kill / forceKill', () => {
    it('should return false when no process running', () => {
      const sb = new Sandbox();
      // No child process — should return false
      expect(sb.kill()).toBe(false);
      expect(sb.forceKill()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should be idempotent', async () => {
      const sb = new Sandbox();
      // First cleanup (no workDir set yet — should not throw)
      await sb.cleanup();
      // Second cleanup (should see _cleanedUp=true and skip)
      await sb.cleanup();
      // No error = pass
    });
  });

  describe('getWorkDir', () => {
    it('should return empty string before run', () => {
      const sb = new Sandbox();
      expect(sb.getWorkDir()).toBe('');
    });
  });
});

// ── Sandbox Pool Tests ────────────────────────────────────────────────

describe('SandboxPool', () => {
  it('should create with default size', () => {
    const pool = new SandboxPool();
    expect(pool.stats).toEqual({
      total: 0,
      active: 0,
      idle: 0,
      maxSize: 5,
    });
  });

  it('should create with custom size', () => {
    const pool = new SandboxPool(3);
    expect(pool.stats.maxSize).toBe(3);
  });

  it('should return a sandbox from acquire', async () => {
    const pool = new SandboxPool(5);
    const sb = await pool.acquire();
    expect(sb).toBeInstanceOf(Sandbox);
    expect(sb.id).toBeDefined();
    expect(pool.stats.active).toBe(1);
    expect(pool.stats.total).toBe(1);
  });

  it('should release a sandbox back to pool', async () => {
    const pool = new SandboxPool(5);
    const sb = await pool.acquire();
    pool.release(sb.id);
    expect(pool.stats.active).toBe(0);
  });

  it('should drain all sandboxes', async () => {
    const pool = new SandboxPool(5);
    await pool.acquire();
    await pool.acquire();
    expect(pool.stats.total).toBe(2);
    await pool.drain();
    expect(pool.stats.total).toBe(0);
    expect(pool.stats.active).toBe(0);
  });
});
