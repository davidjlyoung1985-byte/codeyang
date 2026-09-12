/**
 * Connection Monitor - 监控长时间运行的操作并提供心跳反馈
 */

export class ConnectionMonitor {
  private lastActivity: number = Date.now();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private idleTimeout: number;
  private heartbeatInterval: number;
  private onIdleCallback?: () => void;

  constructor(
    options: {
      idleTimeout?: number; // 多久无响应算空闲（默认15分钟）
      heartbeatInterval?: number; // 心跳间隔（默认30秒）
      onIdle?: () => void;
    } = {},
  ) {
    this.idleTimeout = options.idleTimeout || 900_000; // 15分钟
    this.heartbeatInterval = options.heartbeatInterval || 30_000; // 30秒
    this.onIdleCallback = options.onIdle;
  }

  /**
   * 开始监控
   */
  start(message: string = '处理中'): void {
    this.lastActivity = Date.now();

    // 显示初始提示信息，随后用心跳点表示活跃状态
    process.stdout.write(`${message} `);

    // 健康检查定时器（每5秒检查一次）
    this.healthCheckTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastActivity;

      if (idleTime > this.idleTimeout) {
        console.warn(`\n⚠️ ${Math.floor(idleTime / 1000)}秒无响应，可能出现问题`);
        console.warn('提示：按 Ctrl+C 中断，或继续等待');

        if (this.onIdleCallback) {
          this.onIdleCallback();
        }
      }
    }, 5000);

    // 心跳定时器（定期显示进度点）
    let beatCount = 0;
    this.heartbeatTimer = setInterval(() => {
      beatCount++;
      const idleTime = Date.now() - this.lastActivity;

      // 只在活跃时显示心跳
      if (idleTime < this.heartbeatInterval * 2) {
        process.stdout.write('.');

        // 每10个心跳换行
        if (beatCount % 10 === 0) {
          const elapsed = Math.floor((Date.now() - this.lastActivity) / 1000);
          process.stdout.write(` (${elapsed}s)\n`);
        }
      }
    }, this.heartbeatInterval);
  }

  /**
   * 记录活动（重置空闲计时器）
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 清理输出
    process.stdout.write('\n');
  }

  /**
   * 获取空闲时间（毫秒）
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }
}

/**
 * 进度报告器 - 显示简单的进度动画
 */
export class ProgressReporter {
  private timer: NodeJS.Timeout | null = null;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;

  start(message: string = '正在处理'): void {
    this.currentFrame = 0;
    this.timer = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      process.stdout.write(`\r${frame} ${message}...`);
    }, 80);
  }

  update(message: string): void {
    if (this.timer) {
      const frame = this.frames[this.currentFrame];
      process.stdout.write(`\r${frame} ${message}...`);
    }
  }

  stop(finalMessage?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;

      if (finalMessage) {
        process.stdout.write(`\r✓ ${finalMessage}\n`);
      } else {
        process.stdout.write('\r\n');
      }
    }
  }

  fail(errorMessage: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write(`\r✗ ${errorMessage}\n`);
    }
  }
}
