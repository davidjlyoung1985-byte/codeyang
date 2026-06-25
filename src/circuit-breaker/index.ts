/**
 * ==========================================================
 *  L6: 约束、校验与恢复层 — 熔断器 (Circuit Breaker)
 * ==========================================================
 *
 * 职责:
 *   1. 故障隔离 — 当某个操作持续失败时切断调用链，防止级联故障
 *   2. 自动恢复 — 半开状态下尝试探测是否已恢复
 *   3. 优雅降级 — 熔断时返回 fallback 值或降级策略
 *   4. 指标收集 — 记录熔断次数、失败率、状态变化历史
 *
 * 状态机:
 *   CLOSED (正常) ──连续失败超阈值──→ OPEN (熔断)
 *   OPEN ──等待超时──→ HALF_OPEN (半开探测)
 *   HALF_OPEN ──探测成功──→ CLOSED (恢复)
 *   HALF_OPEN ──探测失败──→ OPEN (再次熔断)
 *
 * 使用方式:
 *   const cb = new CircuitBreaker('llm-api', {
 *     failureThreshold: 5,
 *     resetTimeoutMs: 30_000,
 *   });
 *   const result = await cb.call(() => someRiskyOperation());
 *   // 如果熔断，result = { success: false, error: 'Circuit open', fallback: true }
 *
 * 集成点（见 Agent.ts）:
 *   - LLM API 调用 (withRetry 外围)
 *   - 工具执行 (executeToolBatch 外围)
 *   - MCP 服务调用
 *   - 网络请求
 */

// ===================== 类型定义 =====================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** 连续失败次数阈值 → 触发 OPEN */
  failureThreshold: number;
  /** OPEN → HALF_OPEN 需等待的时间 (ms) */
  resetTimeoutMs: number;
  /** HALF_OPEN 状态下的探测请求超时 (ms) */
  probeTimeoutMs: number;
  /** HALF_OPEN 状态允许的最大并发探测数 */
  maxProbeConcurrency: number;
  /** 慢调用阈值 (ms)，超过的计入失败 */
  slowCallThresholdMs: number;
  /** 统计窗口大小（最近多少条记录用于计算失败率） */
  windowSize: number;
  /** 失败率阈值（0-1），超过则熔断（覆盖 failureThreshold） */
  failureRateThreshold: number;
  /** 最小请求数（低于此数量的窗口不触发率熔断） */
  minRequestCount: number;
}

/** 健康检查函数 — 返回 true 表示服务正常 */
export type HealthCheck = () => Promise<boolean>;

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  failureRate: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
  halfOpenedAt: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  openCount: number; // 累计熔断次数
  avgDurationMs: number;
  isDegraded: boolean;
}

export interface CircuitBreakerResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** 是否因熔断走了 fallback */
  fallback: boolean;
  /** 调用耗时 ms */
  durationMs: number;
}

export interface StateTransition {
  from: CircuitState;
  to: CircuitState;
  timestamp: number;
  reason: string;
}

export type DegradeStrategy<T = unknown> = (name: string, error: string) => Promise<T> | T;

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  probeTimeoutMs: 10_000,
  maxProbeConcurrency: 1,
  slowCallThresholdMs: 30_000,
  windowSize: 50,
  failureRateThreshold: 0.5,
  minRequestCount: 10,
};

// ===================== CircuitBreaker =====================

export class CircuitBreaker {
  readonly name: string;
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'CLOSED';

  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private totalCalls = 0;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private openedAt: number | null = null;
  private halfOpenedAt: number | null = null;
  private openCount = 0;
  private totalDurationMs = 0;

  /** 滑动窗口 — 最近 N 次调用记录 */
  private recentResults: Array<{ success: boolean; durationMs: number; timestamp: number }> = [];

  /** 状态变更历史 */
  private transitions: StateTransition[] = [];

  /** HALF_OPEN 状态下的活跃探测数 */
  private activeProbes = 0;

  /** 健康检查函数（可选） */
  private healthCheck: HealthCheck | null = null;

  /** 降级策略函数（可选） */
  private degradeStrategies = new Map<string, DegradeStrategy>();

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========== 配置 ==========

  setConfig(config: Partial<CircuitBreakerConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  setHealthCheck(fn: HealthCheck | null) {
    this.healthCheck = fn;
  }

  /** 注册指定操作的降级策略 */
  registerDegradeStrategy(operation: string, strategy: DegradeStrategy) {
    this.degradeStrategies.set(operation, strategy);
  }

  // ========== 核心调用 ==========

  /**
   * 通过熔断器执行一个操作。
   *
   * 1. 当前 OPEN → 走 fallback（或抛出错误）
   * 2. 当前 HALF_OPEN → 限制并发探测数
   * 3. 执行操作 → 记录结果 → 更新状态
   */
  async call<T>(
    fn: () => Promise<T>,
    opts?: {
      /** 操作名称（用于选择降级策略） */
      operation?: string;
      /** 超时 (ms)，覆盖默认值 */
      timeoutMs?: number;
    },
  ): Promise<CircuitBreakerResult<T>> {
    const t0 = Date.now();

    // ── 状态检查 ──
    if (this.state === 'OPEN') {
      // 检查重置超时是否已过
      if (this.openedAt && Date.now() - this.openedAt >= this.config.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN', 'Reset timeout elapsed');
      } else {
        return this.degrade<T>(opts?.operation, 'Circuit breaker is OPEN');
      }
    }

    // ── HALF_OPEN 并发限制 ──
    if (this.state === 'HALF_OPEN') {
      if (this.activeProbes >= this.config.maxProbeConcurrency) {
        return this.degrade<T>(opts?.operation, 'Max probe concurrency reached');
      }
      this.activeProbes++;
    }

    // ── 执行 ──
    try {
      const timeoutMs = opts?.timeoutMs || this.config.probeTimeoutMs;
      let result: T;

      if (timeoutMs > 0) {
        result = await this.withTimeout(fn, timeoutMs);
      } else {
        result = await fn();
      }

      const durationMs = Date.now() - t0;
      this.onSuccess(durationMs);

      // 慢调用检测
      if (durationMs > this.config.slowCallThresholdMs) {
        this.onFailure(durationMs, `Slow call: ${durationMs}ms > ${this.config.slowCallThresholdMs}ms`);
        return {
          success: true,
          data: result,
          fallback: false,
          durationMs,
          error: `Warning: slow call (${durationMs}ms)`,
        };
      }

      return { success: true, data: result, fallback: false, durationMs };
    } catch (err) {
      const durationMs = Date.now() - t0;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.onFailure(durationMs, errorMsg);

      // 走降级
      return this.degrade<T>(opts?.operation, errorMsg, durationMs);
    } finally {
      if (this.state === 'HALF_OPEN') {
        this.activeProbes = Math.max(0, this.activeProbes - 1);
      }
    }
  }

  /**
   * 检查熔断器状态，不执行操作。
   * 返回 true 表示"允许调用"（CLOSED 或 HALF_OPEN）。
   */
  canCall(): boolean {
    if (this.state === 'OPEN') {
      // 检查重置超时
      if (this.openedAt && Date.now() - this.openedAt >= this.config.resetTimeoutMs) {
        // 延迟转换到 HALF_OPEN（实际调用时才会触发）
        return true;
      }
      return false;
    }
    return true;
  }

  // ========== 状态管理 ==========

  getState(): CircuitState {
    return this.state;
  }

  /** 手动重置到 CLOSED */
  reset(): void {
    this.transitionTo('CLOSED', 'Manual reset');
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureAt = null;
    this.lastSuccessAt = null;
    this.openedAt = null;
    this.halfOpenedAt = null;
    this.recentResults = [];
  }

  /** 手动强制熔断 */
  forceOpen(reason?: string): void {
    this.transitionTo('OPEN', reason || 'Force open');
  }

  // ========== 统计 ==========

  getStats(): CircuitBreakerStats {
    const totalCalls = this.successCount + this.failureCount;
    const failureRate = totalCalls > 0 ? this.failureCount / totalCalls : 0;
    const avgDurationMs = totalCalls > 0 ? Math.round(this.totalDurationMs / totalCalls) : 0;

    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls,
      failureRate: Math.round(failureRate * 100) / 100,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      openedAt: this.openedAt,
      halfOpenedAt: this.halfOpenedAt,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      openCount: this.openCount,
      avgDurationMs,
      isDegraded: this.state !== 'CLOSED',
    };
  }

  /** 获取状态变更历史 */
  getTransitions(limit = 20): StateTransition[] {
    return this.transitions.slice(-limit);
  }

  // ========== 内部方法 ==========

  private async degrade<T>(operation?: string, error?: string, durationMs = 0): Promise<CircuitBreakerResult<T>> {
    const op = operation || this.name;

    // 尝试使用注册的降级策略
    if (this.degradeStrategies.has(op)) {
      try {
        const strategy = this.degradeStrategies.get(op)!;
        const fallbackData = await strategy(op, error || 'Circuit open');
        return {
          success: true,
          data: fallbackData as T,
          fallback: true,
          durationMs,
          error: `Fallback applied: ${error || 'Circuit open'}`,
        };
      } catch {
        // 降级策略也失败，返回错误
      }
    }

    // 通用降级：返回错误
    return {
      success: false,
      error: error || `Circuit breaker '${this.name}' is OPEN`,
      fallback: true,
      durationMs,
    };
  }

  private onSuccess(durationMs: number) {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;
    this.successCount++;
    this.lastSuccessAt = Date.now();
    this.totalCalls++;
    this.totalDurationMs += durationMs;

    this.recordResult(true, durationMs);

    // HALF_OPEN 下成功 → 转 CLOSED
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED', 'Probe succeeded');
      this.consecutiveSuccesses = 0;
    }
  }

  private onFailure(durationMs: number, error: string) {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.failureCount++;
    this.lastFailureAt = Date.now();
    this.totalCalls++;
    this.totalDurationMs += durationMs;

    this.recordResult(false, durationMs);

    // 更新状态
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN', `Probe failed: ${error.slice(0, 100)}`);
    } else if (this.state === 'CLOSED') {
      // 检查两个条件：连续失败 & 窗口失败率
      const shouldOpenByThreshold = this.consecutiveFailures >= this.config.failureThreshold;
      const shouldOpenByRate = this.shouldOpenByFailureRate();

      if (shouldOpenByThreshold || shouldOpenByRate) {
        const reason = shouldOpenByRate
          ? `Failure rate exceeded ${Math.round(this.config.failureRateThreshold * 100)}% in last ${this.config.windowSize} calls`
          : `Consecutive failures: ${this.consecutiveFailures}/${this.config.failureThreshold}`;
        this.transitionTo('OPEN', reason);
      }
    }
  }

  /** 基于滑动窗口失败率的熔断判断 */
  private shouldOpenByFailureRate(): boolean {
    const window = this.recentResults.slice(-this.config.windowSize);
    if (window.length < this.config.minRequestCount) return false;

    const failures = window.filter((r) => !r.success).length;
    const rate = failures / window.length;
    return rate >= this.config.failureRateThreshold;
  }

  private recordResult(success: boolean, durationMs: number) {
    this.recentResults.push({ success, durationMs, timestamp: Date.now() });

    // 只保留窗口大小
    if (this.recentResults.length > this.config.windowSize) {
      this.recentResults.shift();
    }
  }

  private transitionTo(newState: CircuitState, reason: string) {
    if (this.state === newState) return;

    const transition: StateTransition = {
      from: this.state,
      to: newState,
      timestamp: Date.now(),
      reason,
    };
    this.transitions.push(transition);
    this.state = newState;

    // 记录时间戳
    if (newState === 'OPEN') {
      this.openedAt = Date.now();
      this.openCount++;
    }
    if (newState === 'HALF_OPEN') {
      this.halfOpenedAt = Date.now();
    }
    if (newState === 'CLOSED') {
      this.openedAt = null;
      this.halfOpenedAt = null;
    }
  }

  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

// ===================== CircuitBreakerManager =====================

/**
 * 熔断器管理器 — 按名称管理多个 CircuitBreaker 实例。
 *
 * 用于统一管理所有受保护资源的熔断器。
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  /** 全局默认配置 */
  private defaultConfig: Partial<CircuitBreakerConfig> = {};

  setDefaultConfig(config: Partial<CircuitBreakerConfig>) {
    this.defaultConfig = config;
  }

  /**
   * 获取或创建熔断器。
   * 如果已存在则返回现有实例（不会重置配置）。
   */
  get(name: string): CircuitBreaker {
    let cb = this.breakers.get(name);
    if (!cb) {
      cb = new CircuitBreaker(name, this.defaultConfig);
      this.breakers.set(name, cb);
    }
    return cb;
  }

  /**
   * 创建熔断器（如果已存在则覆盖）。
   */
  create(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const cb = new CircuitBreaker(name, { ...this.defaultConfig, ...config });
    this.breakers.set(name, cb);
    return cb;
  }

  /** 检查某个熔断器是否允许调用 */
  canCall(name: string): boolean {
    return this.breakers.get(name)?.canCall() ?? true;
  }

  /** 获取所有熔断器的统计信息 */
  getAllStats(): CircuitBreakerStats[] {
    return [...this.breakers.values()].map((cb) => cb.getStats());
  }

  /** 重置所有熔断器 */
  resetAll(): void {
    for (const cb of this.breakers.values()) {
      cb.reset();
    }
  }

  /** 获取处于熔断状态的熔断器列表 */
  getOpenBreakers(): CircuitBreaker[] {
    return [...this.breakers.values()].filter((cb) => cb.getState() === 'OPEN');
  }

  /** 移除熔断器 */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /** 熔断器总数 */
  get size(): number {
    return this.breakers.size;
  }
}

// ===================== 预置降级策略 =====================

/** 返回空结果的降级策略（适用于查询类操作） */
export function emptyResultDegradeStrategy<T>(defaultValue: T): DegradeStrategy<T> {
  return () => defaultValue;
}

/** 返回缓存旧值的降级策略 */
export function cachedResultDegradeStrategy<T>(getCached: () => T | null): DegradeStrategy<T | null> {
  return (_name: string, error: string) => {
    const cached = getCached();
    if (cached !== null) return Promise.resolve(cached);
    throw new Error(`Circuit open and no cached data available: ${error}`);
  };
}
