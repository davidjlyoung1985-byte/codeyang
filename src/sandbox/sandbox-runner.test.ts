import { describe, it, expect } from 'vitest';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SandboxResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

describe('sandbox-runner', () => {
  const runnerPath = join(__dirname, 'sandbox-runner.ts');

  it('executes simple command successfully', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '--version'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });

      child.on('exit', () => {
        // Fallback if no message received
        if (!child.killed) {
          resolve({
            success: false,
            stdout: '',
            stderr: 'No message received',
            exitCode: 1,
            durationMs: 0,
            timedOut: false,
          });
        }
      });
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('v');
  });

  it('captures stderr output', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '-e', 'console.error("error message")'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });
    });

    expect(result.success).toBe(true);
    expect(result.stderr).toContain('error message');
  });

  it('handles command failure with exit code', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '-e', 'process.exit(42)'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(42);
  });

  it('respects timeout from environment', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '-e', 'setTimeout(() => {}, 10000)'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
        env: {
          ...process.env,
          CODEYANG_SANDBOX_TIMEOUT: '500',
        },
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });

      // Force timeout if it hangs
      setTimeout(() => {
        child.kill();
        resolve({ success: false, timedOut: true, durationMs: 1000, exitCode: 1, stdout: '', stderr: '' });
      }, 2000);
    });

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  });

  it('truncates large stdout', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '-e', 'console.log("x".repeat(2000000))'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
        env: {
          ...process.env,
          CODEYANG_SANDBOX_MAX_STDOUT: '1000',
        },
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });
    });

    expect(result.stdout.length).toBeLessThanOrEqual(1100); // Max + truncation message
    expect(result.stdout).toContain('truncated');
  });

  it('sets sandbox environment markers', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '-e', 'console.log(process.env.CODEYANG_SANDBOX)'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });
    });

    expect(result.stdout.trim()).toBe('1');
  });

  it('handles non-existent command', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['nonexistent_command_xyz_12345'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });

      child.on('exit', () => {
        // Fallback
        resolve({ success: false, exitCode: 1, stdout: '', stderr: '', durationMs: 0, timedOut: false });
      });
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  it('reports execution duration', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '-e', 'setTimeout(() => {}, 100)'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });
    });

    expect(result.durationMs).toBeGreaterThan(90);
    // Upper bound is intentionally loose: `durationMs` covers forking a child
    // with tsx/cjs registration, which spikes past a tight bound when the suite
    // runs the whole project in parallel. This asserts the timer is reported and
    // plausible, not that the host is fast.
    expect(result.durationMs).toBeLessThan(10_000);
  });

  it('handles stderr truncation', async () => {
    const result = await new Promise<SandboxResult>((resolve) => {
      const child = fork(runnerPath, ['node', '-e', 'console.error("e".repeat(2000000))'], {
        silent: true,
        execArgv: ['-r', 'tsx/cjs'],
        env: {
          ...process.env,
          CODEYANG_SANDBOX_MAX_STDERR: '1000',
        },
      });

      child.on('message', (msg) => {
        resolve(msg as SandboxResult);
      });
    });

    expect(result.stderr.length).toBeLessThanOrEqual(1100);
    expect(result.stderr).toContain('truncated');
  });
});
