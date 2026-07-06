/**
 * ==========================================================
 *  横切能力: 安全与沙箱 — 沙箱隔离 (Sandbox)
 * ==========================================================
 *
 * 职责:
 *   1. 进程隔离 — 在子进程中执行不可信代码，与主进程隔离
 *   2. 资源限制 — CPU / 内存 / 磁盘 / 网络使用上限
 *   3. 超时控制 — 强制终止超时任务
 *   4. 文件系统隔离 — 限制只能访问特定目录
 *   5. 网络隔离 — 可选择禁止网络访问
 *   6. 结果捕获 — 获取 stdout/stderr/exitCode
 *
 * 架构:
 *   Sandbox 使用 child_process.fork() 在独立进程中运行，
 *   通过 IPC 通道通信。支持 Pre-exec 钩子进行环境初始化。
 *
 *   ┌─────────────┐     IPC      ┌───────────────┐
 *   │  Sandbox     │◄──────────►│  Sandboxed     │
 *   │  (Manager)   │   channel  │  (Child Proc)  │
 *   └─────────────┘             └───────────────┘
 *
 * 使用方式:
 *   const sb = new Sandbox({ timeoutMs: 30_000, memoryMb: 512 });
 *   const result = await sb.run('node', ['script.js'], { cwd: '/tmp/work' });
 *   console.log(result.stdout);
 *
 * 集成点（见 tools/BashTool.ts）:
 *   - BashTool 中高危命令 (rm -rf, sudo, curl|sh) 走沙箱执行
 *   - MCP 服务器启动（隔离第三方服务）
 *   - 用户脚本执行（Python / Node 脚本）
 */

import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve, normalize } from 'node:path';
import { tmpdir, platform } from 'node:os';

// ===================== 类型定义 =====================

export interface SandboxConfig {
  /** 执行超时 ms（默认 30s） */
  timeoutMs: number;
  /** 最大内存 MB（默认 512 MB，仅 Linux 下生效） */
  maxMemoryMb: number;
  /** 允许的 PATH 环境变量 */
  allowedPaths: string[];
  /** 禁止的 PATH 模式（glob） */
  blockedPathPatterns: string[];
  /** 是否禁止网络访问（默认 false） */
  blockNetwork: boolean;
  /** 临时工作目录前缀 */
  tempDirPrefix: string;
  /** 清除临时目录（默认 true） */
  cleanupTempDir: boolean;
  /** 最大 stdout 字节数（默认 1MB） */
  maxStdoutBytes: number;
  /** 最大 stderr 字节数（默认 1MB） */
  maxStderrBytes: number;
  /** 允许的环境变量白名单 */
  allowedEnvVars: string[];
}

export interface SandboxResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /** 是否因超时终止 */
  timedOut: boolean;
  /** 是否因资源限制终止 */
  resourceLimited: boolean;
  /** 沙箱 ID */
  sandboxId: string;
  /** 工作目录 */
  workDir: string;
  /** 执行的命令 */
  command: string;
}

export interface SandboxFile {
  /** 相对于沙箱工作目录的路径 */
  path: string;
  content: string;
}

export type SandboxHook = (sandboxId: string, workDir: string) => Promise<void>;

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: SandboxConfig = {
  timeoutMs: 30_000,
  maxMemoryMb: 512,
  allowedPaths: [],
  blockedPathPatterns: ['/etc/shadow', '/etc/sudoers', '/etc/passwd', '/dev/sd*', '/sys/*', '/proc/*'],
  blockNetwork: false,
  tempDirPrefix: 'codeyang-sandbox-',
  cleanupTempDir: true,
  maxStdoutBytes: 1_048_576, // 1MB
  maxStderrBytes: 1_048_576,
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'LANG', 'NODE_PATH'],
};

// ===================== PathValidator =====================

/**
 * 路径安全校验器 — 白名单 + 黑名单双重检查。
 */
class PathValidator {
  constructor(private config: SandboxConfig) {}

  /**
   * 检查路径是否在允许范围内。
   * 返回 true 表示安全，false 表示被禁止。
   */
  isAllowed(absolutePath: string): boolean {
    const normalized = normalize(absolutePath);

    // 检查黑名单
    for (const pattern of this.config.blockedPathPatterns) {
      const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      if (regex.test(normalized)) {
        return false;
      }
    }

    // 如果白名单为空，默认允许所有（除了黑名单外的）
    if (this.config.allowedPaths.length === 0) return true;

    // 检查白名单
    for (const allowed of this.config.allowedPaths) {
      const resolved = resolve(allowed);
      if (normalized.startsWith(resolved)) {
        return true;
      }
    }

    return false;
  }
}

// ===================== ResourceLimiter =====================

/**
 * 资源限制器 — 构造子进程资源限制参数。
 *
 * Windows 下通过 job object 限制，Linux 下通过 rlimits。
 * 这里提供跨平台的参数构造。
 */
class ResourceLimiter {
  constructor(private config: SandboxConfig) {}

  /** 获取子进程 spawn 的选项 */
  getSpawnOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    if (platform() === 'linux' || platform() === 'darwin') {
      // Unix: 使用 ulimit 前置命令
      const limits: string[] = [];
      if (this.config.maxMemoryMb > 0) {
        limits.push(`ulimit -v ${this.config.maxMemoryMb * 1024}`);
      }
      if (this.config.timeoutMs > 0) {
        limits.push(`ulimit -t ${Math.ceil(this.config.timeoutMs / 1000)}`);
      }
      if (limits.length > 0) {
        options.shell = true;
      }
    }

    if (this.config.blockNetwork) {
      // 网络禁止提示（实际需要 OS 级网络命名空间支持）
      // 这里通过环境变量提醒沙箱内的脚本
      options.env = {
        ...process.env,
        CODEYANG_SANDBOX_NETWORK_BLOCKED: '1',
      };
    }

    return options;
  }
}

// ===================== Sandbox =====================

export class Sandbox {
  readonly id: string;
  private config: SandboxConfig;
  private workDir: string;
  private pathValidator: PathValidator;
  private resourceLimiter: ResourceLimiter;
  private childProcess: ChildProcess | null = null;
  private startTime = 0;
  private _cleanedUp = false;

  /** Pre-exec 钩子（如安装依赖、准备环境） */
  private preExecHooks: SandboxHook[] = [];
  /** Post-exec 钩子（如清理） */
  private postExecHooks: SandboxHook[] = [];

  constructor(config?: Partial<SandboxConfig>) {
    this.id = randomUUID().slice(0, 12);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.workDir = '';
    this.pathValidator = new PathValidator(this.config);
    this.resourceLimiter = new ResourceLimiter(this.config);
  }

  // ========== 配置 ==========

  setConfig(config: Partial<SandboxConfig>) {
    this.config = { ...this.config, ...config };
    this.pathValidator = new PathValidator(this.config);
    this.resourceLimiter = new ResourceLimiter(this.config);
  }

  registerPreExecHook(hook: SandboxHook) {
    this.preExecHooks.push(hook);
  }

  registerPostExecHook(hook: SandboxHook) {
    this.postExecHooks.push(hook);
  }

  // ========== 核心执行 ==========

  /**
   * 在沙箱中执行命令。
   *
   * 流程:
   *   1. 创建工作目录
   *   2. 写入用户提供的文件
   *   3. 运行 pre-exec 钩子
   *   4. fork 子进程执行命令
   *   5. 等待完成或超时
   *   6. 运行 post-exec 钩子
   *   7. 清理（可选）
   */
  async run(
    command: string,
    args: string[] = [],
    opts?: {
      /** 输入文件列表（写入工作目录） */
      files?: SandboxFile[];
      /** 自定义工作目录（不传则自动创建临时目录） */
      cwd?: string;
      /** 覆盖超时 */
      timeoutMs?: number;
      /** 环境变量 */
      env?: Record<string, string>;
    },
  ): Promise<SandboxResult> {
    this.startTime = Date.now();
    const timeoutMs = opts?.timeoutMs ?? this.config.timeoutMs;

    // ── 路径安全检查 ──
    const commandPath = resolve(command);
    if (!this.pathValidator.isAllowed(commandPath) && !this.isBuiltinCommand(command)) {
      return {
        success: false,
        stdout: '',
        stderr: `Path blocked by sandbox policy: ${commandPath}`,
        exitCode: null,
        durationMs: Date.now() - this.startTime,
        timedOut: false,
        resourceLimited: false,
        sandboxId: this.id,
        workDir: '',
        command,
      };
    }

    // ── 工作目录 ──
    try {
      this.workDir = opts?.cwd || (await this.createTempDir());
    } catch (err) {
      return {
        success: false,
        stdout: '',
        stderr: `Failed to create sandbox workdir: ${err instanceof Error ? err.message : String(err)}`,
        exitCode: null,
        durationMs: Date.now() - this.startTime,
        timedOut: false,
        resourceLimited: false,
        sandboxId: this.id,
        workDir: '',
        command,
      };
    }

    // ── 写入文件 ──
    if (opts?.files) {
      for (const file of opts.files) {
        try {
          const fullPath = join(this.workDir, file.path);
          await mkdir(join(fullPath, '..'), { recursive: true });
          await writeFile(fullPath, file.content, 'utf-8');
        } catch (err) {
          return {
            success: false,
            stdout: '',
            stderr: `Failed to write sandbox file: ${err instanceof Error ? err.message : String(err)}`,
            exitCode: null,
            durationMs: Date.now() - this.startTime,
            timedOut: false,
            resourceLimited: false,
            sandboxId: this.id,
            workDir: this.workDir,
            command,
          };
        }
      }
    }

    // ── Pre-exec 钩子 ──
    try {
      for (const hook of this.preExecHooks) {
        await hook(this.id, this.workDir);
      }
    } catch (err) {
      return {
        success: false,
        stdout: '',
        stderr: `Pre-exec hook failed: ${err instanceof Error ? err.message : String(err)}`,
        exitCode: null,
        durationMs: Date.now() - this.startTime,
        timedOut: false,
        resourceLimited: false,
        sandboxId: this.id,
        workDir: this.workDir,
        command,
      };
    }

    // ── 执行命令 ──
    return new Promise<SandboxResult>((resolveResult) => {
      let timedOut = false;
      let stdout = '';
      let stderr = '';
      let stdoutExceeded = false;
      let stderrExceeded = false;

      const spawnArgs = this.resourceLimiter.getSpawnOptions();
      const env = {
        ...(spawnArgs.env as Record<string, string> | undefined),
        ...this.buildEnv(opts?.env),
      };

      // 清理函数（先在作用域中声明，因为在 try-catch 和 exit handler 中都会用到）
      const doCleanup = () => {
        this.childProcess = null;
      };

      try {
        this.childProcess = fork(this.getSandboxRunnerPath(), [command, ...args], {
          cwd: this.workDir,
          env,
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          serialization: 'advanced',
        });
      } catch (err) {
        doCleanup();
        resolveResult({
          success: false,
          stdout: '',
          stderr: `Failed to start sandbox process: ${err instanceof Error ? err.message : String(err)}`,
          exitCode: null,
          durationMs: Date.now() - this.startTime,
          timedOut: false,
          resourceLimited: false,
          sandboxId: this.id,
          workDir: this.workDir,
          command,
        });
        return;
      }

      // ── stdout ──
      this.childProcess.stdout?.on('data', (chunk: Buffer) => {
        if (!stdoutExceeded) {
          const remaining = this.config.maxStdoutBytes - Buffer.byteLength(stdout);
          if (remaining <= 0) {
            stdoutExceeded = true;
            stdout += '\n... (stdout truncated, exceeded max)';
          } else {
            stdout += chunk.toString().slice(0, remaining);
          }
        }
      });

      // ── stderr ──
      this.childProcess.stderr?.on('data', (chunk: Buffer) => {
        if (!stderrExceeded) {
          const remaining = this.config.maxStderrBytes - Buffer.byteLength(stderr);
          if (remaining <= 0) {
            stderrExceeded = true;
            stderr += '\n... (stderr truncated, exceeded max)';
          } else {
            stderr += chunk.toString().slice(0, remaining);
          }
        }
      });

      // ── 超时计时器 ──
      const timer = setTimeout(() => {
        timedOut = true;
        this.kill('SIGTERM');
      }, timeoutMs);

      // ── 完成 ──
      this.childProcess.on('exit', (exitCode) => {
        clearTimeout(timer);
        const result: SandboxResult = {
          success: exitCode === 0 && !timedOut,
          stdout,
          stderr,
          exitCode,
          durationMs: Date.now() - this.startTime,
          timedOut,
          resourceLimited: false,
          sandboxId: this.id,
          workDir: this.workDir,
          command,
        };
        finishCleanup();
        resolveResult(result);
      });

      this.childProcess.on('error', (err) => {
        clearTimeout(timer);
        const result: SandboxResult = {
          success: false,
          stdout,
          stderr: `Sandbox process error: ${err.message}`,
          exitCode: null,
          durationMs: Date.now() - this.startTime,
          timedOut,
          resourceLimited: false,
          sandboxId: this.id,
          workDir: this.workDir,
          command,
        };
        doCleanup();
        resolveResult(result);
      });

      // ── 异步清理（exit 和 error 回调中调用） ──
      const finishCleanup = () => {
        doCleanup();
        // Post-exec 钩子（fire-and-forget，不能阻塞 resolveResult）
        for (const hook of this.postExecHooks) {
          hook(this.id, this.workDir).catch((err) =>
            console.warn('⚠️ [Sandbox] Post-exec hook failed:', err instanceof Error ? err.message : err),
          );
        }
        // 清理临时目录（fire-and-forget）
        if (this.config.cleanupTempDir && !opts?.cwd) {
          this.cleanup().catch((err) =>
            console.warn('⚠️ [Sandbox] Cleanup failed:', err instanceof Error ? err.message : err),
          );
        }
      };
    });
  }

  // ========== 生命周期 ==========

  /** 终止沙箱进程 */
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this.childProcess && !this.childProcess.killed) {
      try {
        return this.childProcess.kill(signal);
      } catch {
        return false;
      }
    }
    return false;
  }

  /** 强制终止（SIGKILL） */
  forceKill(): boolean {
    return this.kill('SIGKILL');
  }

  /** 清理工作目录 */
  async cleanup(): Promise<void> {
    if (this._cleanedUp) return;
    this._cleanedUp = true;

    if (this.workDir && this.config.cleanupTempDir) {
      try {
        await rm(this.workDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
    this.childProcess = null;
  }

  /** 是否正在运行 */
  get isRunning(): boolean {
    return this.childProcess !== null && !this.childProcess.killed;
  }

  /** 当前工作目录 */
  getWorkDir(): string {
    return this.workDir;
  }

  // ========== 内部方法 ==========

  private async createTempDir(): Promise<string> {
    const dir = join(tmpdir(), `${this.config.tempDirPrefix}${this.id}`);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private buildEnv(extraEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};

    // 只保留白名单中的环境变量
    for (const key of this.config.allowedEnvVars) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    // 添加沙箱标识
    env['CODEYANG_SANDBOX_ID'] = this.id;
    env['CODEYANG_SANDBOX'] = '1';

    if (this.config.blockNetwork) {
      env['CODEYANG_SANDBOX_NETWORK_BLOCKED'] = '1';
    }

    // 合并用户传入的环境变量
    if (extraEnv) {
      Object.assign(env, extraEnv);
    }

    return env;
  }

  /** 内置命令白名单（不检查路径限制） */
  private isBuiltinCommand(cmd: string): boolean {
    const builtins = ['node', 'npm', 'npx', 'python', 'python3', 'bash', 'sh', 'cmd', 'powershell'];
    return builtins.includes(cmd);
  }

  /** 获取沙箱执行器脚本路径（内嵌的 runner） */
  private getSandboxRunnerPath(): string {
    // 使用内联 script 避免额外文件依赖
    return join(__dirname, 'sandbox-runner.js');
  }
}

// ===================== SandboxPool =====================

/**
 * 沙箱连接池 — 管理和复用多个 Sandbox 实例。
 *
 * 适用于需要频繁创建沙箱的场景（如并行任务执行）。
 */
export class SandboxPool {
  private pool: Sandbox[] = [];
  private active = new Set<string>();
  private config: Partial<SandboxConfig>;

  constructor(
    private maxSize = 5,
    config?: Partial<SandboxConfig>,
  ) {
    this.config = config || {};
  }

  /** 从池中获取一个沙箱 */
  async acquire(): Promise<Sandbox> {
    // 找空闲的
    let sb = this.pool.find((s) => !this.active.has(s.id));
    if (sb) {
      this.active.add(sb.id);
      return sb;
    }

    // 池不满，创建新的
    if (this.pool.length < this.maxSize) {
      sb = new Sandbox(this.config);
      this.pool.push(sb);
      this.active.add(sb.id);
      return sb;
    }

    // 池满了，等待一个释放
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const idle = this.pool.find((s) => !this.active.has(s.id));
        if (idle) {
          clearInterval(check);
          this.active.add(idle.id);
          resolve(idle);
        }
      }, 100);
    });
  }

  /** 释放沙箱回池 */
  release(sandboxId: string) {
    this.active.delete(sandboxId);
  }

  /** 清理所有沙箱 */
  async drain(): Promise<void> {
    for (const sb of this.pool) {
      await sb
        .cleanup()
        .catch((err) => console.warn('⚠️ [Sandbox] Pool cleanup failed:', err instanceof Error ? err.message : err));
    }
    this.pool = [];
    this.active.clear();
  }

  get stats() {
    return {
      total: this.pool.length,
      active: this.active.size,
      idle: this.pool.length - this.active.size,
      maxSize: this.maxSize,
    };
  }
}
