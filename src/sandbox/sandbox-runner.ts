/**
 * Sandbox Runner — executed in a forked child process.
 *
 * Receives [command, ...args] from the parent process and executes them.
 * Captures stdout/stderr and sends results back via IPC.
 * Enforces resource limits set via environment variables.
 */

import { execFile } from 'node:child_process';
import { platform } from 'node:os';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  process.stderr.write('[SandboxRunner] No command provided\n');
  process.exit(1);
}

// ── Resource limits from environment ──────────────────────────
const timeoutMs = parseInt(process.env['CODEYANG_SANDBOX_TIMEOUT'] || '30000', 10);
const maxStdoutBytes = parseInt(process.env['CODEYANG_SANDBOX_MAX_STDOUT'] || '1048576', 10);
const maxStderrBytes = parseInt(process.env['CODEYANG_SANDBOX_MAX_STDERR'] || '1048576', 10);
const networkBlocked = process.env['CODEYANG_SANDBOX_NETWORK_BLOCKED'] === '1';

let stdout = '';
let stderr = '';
let stdoutTruncated = false;
let stderrTruncated = false;
let timedOut = false;
const startTime = Date.now();

// ── Execute ──────────────────────────────────────────────────
const child = execFile(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    // Strip dangerous env vars
    CODEYANG_SANDBOX: '1',
    ...(networkBlocked ? { NODE_OPTIONS: '--no-network' } : {}),
  },
  timeout: timeoutMs,
  maxBuffer: Math.max(maxStdoutBytes, maxStderrBytes),
  shell: platform() === 'win32',
});

child.stdout?.on('data', (chunk: Buffer) => {
  if (!stdoutTruncated) {
    const remaining = maxStdoutBytes - Buffer.byteLength(stdout);
    if (remaining <= 0) {
      stdoutTruncated = true;
      stdout += '\n... (stdout truncated)';
    } else {
      stdout += chunk.toString('utf-8').slice(0, remaining);
    }
  }
});

child.stderr?.on('data', (chunk: Buffer) => {
  if (!stderrTruncated) {
    const remaining = maxStderrBytes - Buffer.byteLength(stderr);
    if (remaining <= 0) {
      stderrTruncated = true;
      stderr += '\n... (stderr truncated)';
    } else {
      stderr += chunk.toString('utf-8').slice(0, remaining);
    }
  }
});

child.on('exit', (code, signal) => {
  const durationMs = Date.now() - startTime;

  if (signal === 'SIGTERM' || signal === 'SIGKILL') {
    timedOut = true;
  }

  const result = {
    success: code === 0 && !timedOut,
    stdout,
    stderr,
    exitCode: code,
    durationMs,
    timedOut,
    signal: signal || undefined,
  };

  // Send result back to parent via IPC
  if (process.send) {
    process.send(result);
  } else {
    // Fallback: write to stdout as JSON
    process.stdout.write(JSON.stringify(result));
  }

  process.exit(code || 0);
});

child.on('error', (err) => {
  const result = {
    success: false,
    stdout: '',
    stderr: `Sandbox process error: ${err.message}`,
    exitCode: null,
    durationMs: Date.now() - startTime,
    timedOut: false,
    signal: undefined,
  };

  if (process.send) {
    process.send(result);
  } else {
    process.stderr.write(JSON.stringify(result));
  }

  process.exit(1);
});

// ── Handle parent messages ────────────────────────────────────
process.on('message', (msg: unknown) => {
  const message = msg as { type?: string; signal?: string };
  if (message?.type === 'kill') {
    child.kill((message.signal as NodeJS.Signals) || 'SIGTERM');
  }
});
