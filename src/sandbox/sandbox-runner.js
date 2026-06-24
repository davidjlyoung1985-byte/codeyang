#!/usr/bin/env node
/**
 * Sandbox Runner — 沙箱子进程执行器
 *
 * 由 Sandbox.fork() 启动，在隔离的子进程中执行命令。
 * 通过 IPC 与父进程通信。
 *
 * 接收参数:
 *   argv[2] — 命令名称（如 "node", "python"）
 *   argv[3..] — 命令参数
 *
 * 环境变量:
 *   CODEYANG_SANDBOX        — "1" 表示在沙箱中运行
 *   CODEYANG_SANDBOX_ID     — 沙箱 ID
 *   CODEYANG_SANDBOX_NETWORK_BLOCKED — "1" 表示禁止网络
 */
const { spawn } = require('child_process');
const { env, argv, exit, stdout, stderr } = process;

// 解析要执行的命令
const command = argv[2];
const args = argv.slice(3);

if (!command) {
  stderr.write('[SandboxRunner] No command specified\n');
  exit(1);
}

// 构建环境变量（继承当前环境，但移除非白名单变量）
const allowedPrefixes = [
  'PATH', 'HOME', 'USER', 'LANG', 'NODE_PATH',
  'CODEYANG_', 'TMP', 'TEMP', 'SystemRoot',
  'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
];

const sandboxEnv = {};
for (const key of Object.keys(env)) {
  if (allowedPrefixes.some(p => key === p || key.startsWith(p))) {
    sandboxEnv[key] = env[key];
  }
}

// 启动子进程
const child = spawn(command, args, {
  env: sandboxEnv,
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

let stdoutData = '';
let stderrData = '';

child.stdout.on('data', (chunk) => {
  stdoutData += chunk.toString();
  stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  stderrData += chunk.toString();
  stderr.write(chunk);
});

child.on('exit', (code, signal) => {
  // 通过 IPC 发送结果
  if (process.send) {
    process.send({
      type: 'exit',
      code,
      signal: signal ? signal.toString() : null,
      stdout: stdoutData,
      stderr: stderrData,
    });
  }
  exit(code !== null ? code : 1);
});

child.on('error', (err) => {
  if (process.send) {
    process.send({
      type: 'error',
      message: err.message,
    });
  }
  stderr.write(`[SandboxRunner] Error: ${err.message}\n`);
  exit(1);
});

// 处理父进程发来的信号
process.on('message', (msg) => {
  if (msg && msg.type === 'kill') {
    child.kill(msg.signal || 'SIGTERM');
  }
});
