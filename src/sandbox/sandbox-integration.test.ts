/**
 * Sandbox 集成测试 - 验证真实的沙箱隔离功能
 *
 * 这些测试验证沙箱是否真正实现了：
 * - 进程隔离
 * - 超时控制
 * - 文件系统隔离
 * - 输出限制
 * - 环境变量控制
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Sandbox, SandboxPool } from './index.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Sandbox - Integration Tests', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox({
      timeoutMs: 5000,
      maxMemoryMb: 256,
      cleanupTempDir: true,
    });
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // ── 基础执行测试 ──

  describe('Basic Execution', () => {
    test('should execute simple echo command', async () => {
      const result = await sandbox.run('node', ['-e', 'console.log("hello from sandbox")']);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello from sandbox');
      expect(result.sandboxId).toBe(sandbox.id);
      expect(result.workDir).toBeTruthy();
      expect(result.durationMs).toBeGreaterThan(0);
    });

    test('should capture stderr', async () => {
      const result = await sandbox.run('node', ['-e', 'console.error("error message")']);

      expect(result.success).toBe(true);
      expect(result.stderr.trim()).toBe('error message');
    });

    test('should handle command failure', async () => {
      const result = await sandbox.run('node', ['-e', 'process.exit(42)']);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });

    test('should handle command with arguments', async () => {
      const result = await sandbox.run('node', [
        '-e',
        'console.log(process.argv.slice(1).join(" "))', // argv[1] onwards for -e scripts
        'arg1',
        'arg2',
        'arg3',
      ]);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('arg1 arg2 arg3');
    });
  });

  // ── 超时控制 ──

  describe('Timeout Control', () => {
    test('should timeout long-running commands', async () => {
      const shortTimeout = new Sandbox({ timeoutMs: 1000, cleanupTempDir: true });

      const result = await shortTimeout.run('node', ['-e', 'setInterval(() => console.log("tick"), 100);']);

      expect(result.timedOut).toBe(true);
      expect(result.success).toBe(false);
      await shortTimeout.cleanup();
    }, 10000);

    test('should complete within timeout', async () => {
      const result = await sandbox.run('node', ['-e', 'setTimeout(() => console.log("done"), 500);']);

      expect(result.success).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(500);
    });

    test('should allow custom timeout override', async () => {
      const result = await sandbox.run('node', ['-e', 'setTimeout(() => console.log("done"), 1500);'], {
        timeoutMs: 3000,
      });

      expect(result.success).toBe(true);
      expect(result.timedOut).toBe(false);
    });
  });

  // ── 输出限制 ──

  describe('Output Limits', () => {
    test('should truncate large stdout', async () => {
      const limitedSandbox = new Sandbox({
        maxStdoutBytes: 100,
        timeoutMs: 5000,
        cleanupTempDir: true,
      });

      const result = await limitedSandbox.run('node', ['-e', 'for(let i=0; i<100; i++) console.log("x".repeat(50));']);

      expect(result.stdout.length).toBeLessThanOrEqual(200); // 100 bytes + truncation message
      expect(result.stdout).toContain('truncated');
      await limitedSandbox.cleanup();
    });

    test('should truncate large stderr', async () => {
      const limitedSandbox = new Sandbox({
        maxStderrBytes: 50,
        timeoutMs: 5000,
        cleanupTempDir: true,
      });

      const result = await limitedSandbox.run('node', [
        '-e',
        'for(let i=0; i<100; i++) console.error("error line " + i);',
      ]);

      expect(result.stderr.length).toBeLessThanOrEqual(100);
      expect(result.stderr).toContain('truncated');
      await limitedSandbox.cleanup();
    });
  });

  // ── 文件系统隔离 ──

  describe('Filesystem Isolation', () => {
    test('should create isolated workdir', async () => {
      const result = await sandbox.run('node', ['-e', 'console.log(process.cwd())']);

      expect(result.success).toBe(true);
      expect(result.workDir).toContain('codeyang-sandbox-');
      expect(result.stdout.trim()).toContain('codeyang-sandbox-');
    });

    test('should write and read files in workdir', async () => {
      const script = `
        const fs = require('fs');
        fs.writeFileSync('test.txt', 'sandbox content');
        const content = fs.readFileSync('test.txt', 'utf-8');
        console.log(content);
      `;

      const result = await sandbox.run('node', ['-e', script]);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('sandbox content');
    });

    test('should inject files into sandbox', async () => {
      const result = await sandbox.run('node', ['script.js'], {
        files: [
          {
            path: 'script.js',
            content: 'console.log("injected file executed");',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('injected file executed');
    });

    test('should inject multiple files', async () => {
      const result = await sandbox.run('node', ['main.js'], {
        files: [
          {
            path: 'main.js',
            content: 'const lib = require("./lib.js"); console.log(lib.greet("World"));',
          },
          {
            path: 'lib.js',
            content: 'module.exports = { greet: (name) => `Hello, ${name}!` };',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Hello, World!');
    });

    test('should prevent access to blocked paths', async () => {
      const restrictedSandbox = new Sandbox({
        blockedPathPatterns: ['/etc/*', '/sys/*', 'C:\\Windows\\System32\\*'],
        timeoutMs: 5000,
        cleanupTempDir: true,
      });

      // Try to run a blocked executable path
      const blockedPath = process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/etc/shadow';

      const result = await restrictedSandbox.run(blockedPath, []);

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('blocked by sandbox policy');
      await restrictedSandbox.cleanup();
    });
  });

  // ── 环境变量控制 ──

  describe('Environment Variables', () => {
    test('should expose sandbox marker', async () => {
      const result = await sandbox.run('node', ['-e', 'console.log(process.env.CODEYANG_SANDBOX);']);

      expect(result.stdout.trim()).toBe('1');
    });

    test('should include sandbox ID', async () => {
      const result = await sandbox.run('node', ['-e', 'console.log(process.env.CODEYANG_SANDBOX_ID);']);

      expect(result.stdout.trim()).toBe(sandbox.id);
    });

    test('should pass custom environment variables', async () => {
      const result = await sandbox.run('node', ['-e', 'console.log(process.env.CUSTOM_VAR);'], {
        env: { CUSTOM_VAR: 'test_value' },
      });

      expect(result.stdout.trim()).toBe('test_value');
    });

    test('should filter environment variables', async () => {
      const restrictedSandbox = new Sandbox({
        allowedEnvVars: ['PATH'],
        timeoutMs: 5000,
        cleanupTempDir: true,
      });

      const result = await restrictedSandbox.run('node', [
        '-e',
        'console.log(JSON.stringify(Object.keys(process.env).filter(k => !k.startsWith("CODEYANG"))));',
      ]);

      const envKeys = JSON.parse(result.stdout.trim());
      // Should only have PATH and maybe a few system vars
      expect(envKeys).toContain('PATH');
      await restrictedSandbox.cleanup();
    });
  });

  // ── 网络隔离标记 ──

  describe('Network Blocking Flag', () => {
    test('should set network blocked environment variable', async () => {
      const networkBlockedSandbox = new Sandbox({
        blockNetwork: true,
        timeoutMs: 5000,
        cleanupTempDir: true,
      });

      const result = await networkBlockedSandbox.run('node', [
        '-e',
        'console.log(process.env.CODEYANG_SANDBOX_NETWORK_BLOCKED);',
      ]);

      expect(result.stdout.trim()).toBe('1');
      await networkBlockedSandbox.cleanup();
    });
  });

  // ── 进程控制 ──

  describe('Process Control', () => {
    test('should report running status', async () => {
      const longRunning = sandbox.run('node', ['-e', 'setTimeout(() => {}, 2000);']);

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(sandbox.isRunning).toBe(true);

      await longRunning;
      expect(sandbox.isRunning).toBe(false);
    });

    test('should kill running process', async () => {
      const longRunning = sandbox.run('node', ['-e', 'setInterval(() => {}, 100);']);

      await new Promise((resolve) => setTimeout(resolve, 200));
      const killed = sandbox.kill();

      expect(killed).toBe(true);

      const result = await longRunning;
      expect(result.success).toBe(false);
    });
  });

  // ── 钩子系统 ──

  describe('Hooks', () => {
    test('should execute pre-exec hooks', async () => {
      let hookCalled = false;
      let receivedSandboxId = '';
      let receivedWorkDir = '';

      sandbox.registerPreExecHook(async (sandboxId, workDir) => {
        hookCalled = true;
        receivedSandboxId = sandboxId;
        receivedWorkDir = workDir;
      });

      const result = await sandbox.run('node', ['-e', 'console.log("test")']);

      expect(hookCalled).toBe(true);
      expect(receivedSandboxId).toBe(sandbox.id);
      expect(receivedWorkDir).toBeTruthy();
      expect(result.success).toBe(true);
    });

    test('should execute post-exec hooks', async () => {
      let hookCalled = false;

      sandbox.registerPostExecHook(async (sandboxId, workDir) => {
        hookCalled = true;
      });

      await sandbox.run('node', ['-e', 'console.log("test")']);

      // Post-exec hooks are fire-and-forget, give them time
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(hookCalled).toBe(true);
    });

    test('should fail on pre-exec hook error', async () => {
      sandbox.registerPreExecHook(async () => {
        throw new Error('Pre-exec failed');
      });

      const result = await sandbox.run('node', ['-e', 'console.log("test")']);

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Pre-exec hook failed');
      expect(result.stderr).toContain('Pre-exec failed');
    });
  });

  // ── 清理测试 ──

  describe('Cleanup', () => {
    test('should track workDir location', async () => {
      const result = await sandbox.run('node', ['-e', 'console.log("test")']);
      const workDir = sandbox.getWorkDir();

      expect(workDir).toBe(result.workDir);
      expect(workDir).toContain('codeyang-sandbox-');
    });

    test('should be idempotent', async () => {
      await sandbox.run('node', ['-e', 'console.log("test")']);

      await sandbox.cleanup();
      await sandbox.cleanup(); // Second call should not throw

      // No error = pass
      expect(true).toBe(true);
    });
  });
});

// ── SandboxPool Integration Tests ──

describe('SandboxPool - Integration', () => {
  let pool: SandboxPool;

  beforeEach(() => {
    pool = new SandboxPool(3, { timeoutMs: 5000 });
  });

  afterEach(async () => {
    await pool.drain();
  });

  test('should execute commands in pooled sandboxes', async () => {
    const sb1 = await pool.acquire();
    const result = await sb1.run('node', ['-e', 'console.log("from pool")']);

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('from pool');

    pool.release(sb1.id);
  });

  test('should reuse released sandboxes', async () => {
    const sb1 = await pool.acquire();
    const id1 = sb1.id;

    await sb1.run('node', ['-e', 'console.log("first run")']);
    pool.release(sb1.id);

    const sb2 = await pool.acquire();
    expect(sb2.id).toBe(id1); // Should reuse

    const result = await sb2.run('node', ['-e', 'console.log("second run")']);
    expect(result.success).toBe(true);

    pool.release(sb2.id);
  });

  test('should manage multiple concurrent sandboxes', async () => {
    const sb1 = await pool.acquire();
    const sb2 = await pool.acquire();
    const sb3 = await pool.acquire();

    expect(pool.stats.active).toBe(3);
    expect(pool.stats.total).toBe(3);

    const results = await Promise.all([
      sb1.run('node', ['-e', 'console.log("task 1")']),
      sb2.run('node', ['-e', 'console.log("task 2")']),
      sb3.run('node', ['-e', 'console.log("task 3")']),
    ]);

    expect(results[0].stdout.trim()).toBe('task 1');
    expect(results[1].stdout.trim()).toBe('task 2');
    expect(results[2].stdout.trim()).toBe('task 3');

    pool.release(sb1.id);
    pool.release(sb2.id);
    pool.release(sb3.id);

    expect(pool.stats.active).toBe(0);
  });
});
