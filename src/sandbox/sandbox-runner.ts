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

// ── Windows compatibility ──────────────────────────────────────
/**
 * On Windows:
 * - shell:true can find 'node' in PATH but mangles quoted arguments
 * - shell:false preserves arguments but can't find 'node'
 * Solution: Use shell:false and resolve common commands to full paths
 */
const isWindows = platform() === 'win32';
let resolvedCommand = command;
let useShell = false;

if (isWindows) {
  // For 'node', use the current Node.js executable
  if (command === 'node' || command === 'node.exe') {
    resolvedCommand = process.execPath;
    useShell = false; // Use direct execution to preserve arguments
  } else {
    // For other commands, try shell (may need PATH resolution)
    useShell = true;
  }
} else {
  // Linux/macOS: direct execution works fine
  useShell = false;
}

// ── Resource limits from environment ──────────────────────────
const timeoutMs = parseInt(process.env['CODEYANG_SANDBOX_TIMEOUT'] || '30000', 10);
const maxStdoutBytes = parseInt(process.env['CODEYANG_SANDBOX_MAX_STDOUT'] || '1048576', 10);
const maxStderrBytes = parseInt(process.env['CODEYANG_SANDBOX_MAX_STDERR'] || '1048576', 10);

let timedOut = false;
const startTime = Date.now();

// ── Execute ──────────────────────────────────────────────────
const execOptions: Parameters<typeof execFile>[2] = {
  cwd: process.cwd(),
  env: {
    ...process.env,
    // Mark as sandboxed
    CODEYANG_SANDBOX: '1',
    // Note: Network blocking flag is set, but actual network isolation
    // requires OS-level features (network namespaces on Linux, job objects on Windows)
    // This flag serves as a marker that can be checked by scripts
  },
  timeout: timeoutMs,
  maxBuffer: Math.max(maxStdoutBytes, maxStderrBytes),
  // Use shell only when necessary (see Windows compatibility section above)
  shell: useShell,
  encoding: 'utf-8',
};

// Use callback-based execFile to get all output at once
execFile(resolvedCommand, args, execOptions, (error, stdout, stderr) => {
  const durationMs = Date.now() - startTime;

  // Check if it was killed by timeout
  if (error && error.killed && error.signal) {
    timedOut = true;
  }

  // Truncate if needed
  let finalStdout = stdout || '';
  let finalStderr = stderr || '';

  if (finalStdout.length > maxStdoutBytes) {
    finalStdout = finalStdout.slice(0, maxStdoutBytes) + '\n... (stdout truncated)';
  }

  if (finalStderr.length > maxStderrBytes) {
    finalStderr = finalStderr.slice(0, maxStderrBytes) + '\n... (stderr truncated)';
  }

  const exitCode = error && !timedOut ? (error.code ?? 1) : 0;

  const result = {
    success: exitCode === 0 && !timedOut,
    stdout: finalStdout,
    stderr: finalStderr,
    exitCode,
    durationMs,
    timedOut,
    signal: error?.signal || undefined,
  };

  // Send result back to parent via IPC
  if (process.send) {
    process.send(result);
  } else {
    // Fallback: write to stdout as JSON
    process.stdout.write(JSON.stringify(result));
  }

  process.exit(exitCode);
});

// ── Handle parent messages ────────────────────────────────────
process.on('message', (msg: unknown) => {
  const message = msg as { type?: string; signal?: string };
  if (message?.type === 'kill') {
    // Note: The child would already be managed by execFile's timeout
    // But we can force kill if needed
    process.exit(1);
  }
});
