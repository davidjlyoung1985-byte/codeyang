/**
 * ==========================================================
 *  L1: 接入与接口层 — 统一 API 网关 (API Gateway)
 * ==========================================================
 *
 * 职责:
 *   1. 统一入口 — 所有外部请求（CLI / WebSocket / MCP / Bridge）经此路由
 *   2. 协议转换 — 将外部协议转为内部标准化 Request 对象
 *   3. 认证校验 — 拦截未授权请求，防止 API Key 泄露
 *   4. 速率限制 — 按用户/来源/IP 做 Rate Limiting
 *   5. 请求审计 — 记录所有入站请求的元数据
 *
 * 架构:
 *   Gateway 使用洋葱模型 (middleware pipeline)，每次请求依次经过:
 *     Auth → RateLimit → Audit → Handler
 *
 * 使用方式:
 *   const gw = Gateway.getInstance();
 *   const resp = await gw.handle(request);
 *
 * 集成点（见 src/index.ts）:
 *   - CLI 入口: Gateway.handle({ source: 'cli', ... })
 *   - Bridge:   Gateway.handle({ source: 'bridge', ... })
 *   - Web:      Gateway.handle({ source: 'web', ... })
 *   - VSCode:   Gateway.handle({ source: 'vscode', ... })
 */

import { randomUUID } from 'node:crypto';

// ===================== 类型定义 =====================

export type RequestSource = 'cli' | 'bridge' | 'web' | 'vscode' | 'mcp' | 'internal';

export interface Request {
  /** 请求唯一 ID (traceId) */
  id: string;
  /** 来源标识 */
  source: RequestSource;
  /** 操作/命令名称 (如 "agent.run", "tool.execute", "session.list") */
  operation: string;
  /** 请求载荷（来源相关的原始数据） */
  payload: unknown;
  /** 认证信息 */
  auth?: {
    apiKey?: string;
    userId?: string;
    token?: string;
  };
  /** 来源元数据（用于审计和限速） */
  meta?: {
    ip?: string;
    userAgent?: string;
    sessionId?: string;
    /** 速率限制 key（默认按 source + ip） */
    rateLimitKey?: string;
  };
  /** 时间戳 */
  timestamp: number;
}

export interface Response {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 处理耗时 ms */
  durationMs: number;
  /** 原始请求 ID */
  requestId: string;
}

export type Middleware = (req: Request, next: () => Promise<Response>) => Promise<Response>;

export interface AuthResult {
  allowed: boolean;
  reason?: string;
  userId?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  remaining?: number;
  limit?: number;
}

export interface AuditEntry {
  requestId: string;
  source: RequestSource;
  operation: string;
  userId?: string;
  timestamp: number;
  durationMs: number;
  allowed: boolean;
  error?: string;
}

// ===================== Auth Provider =====================

export interface AuthProvider {
  /** 校验请求是否通过认证 */
  authenticate(req: Request): Promise<AuthResult>;
}

/** 基于 API Key 的默认认证器 */
export class ApiKeyAuthProvider implements AuthProvider {
  constructor(private validApiKeys: Set<string> = new Set()) {}

  addKey(key: string) {
    this.validApiKeys.add(key);
  }

  removeKey(key: string) {
    this.validApiKeys.delete(key);
  }

  setKeys(keys: string[]) {
    this.validApiKeys = new Set(keys.filter(Boolean));
  }

  authenticate(req: Request): AuthResult {
    // 内部请求免认证
    if (req.source === 'internal') {
      return { allowed: true, userId: 'internal' };
    }

    const key = req.auth?.apiKey;
    if (!key) {
      return { allowed: false, reason: 'Missing API key' };
    }
    if (!this.validApiKeys.has(key)) {
      return { allowed: false, reason: 'Invalid API key' };
    }
    return { allowed: true, userId: req.auth?.userId || 'anonymous' };
  }
}

// ===================== Rate Limiter =====================

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

/**
 * 基于滑动窗口（Token Bucket）的速率限制器
 *
 * 每个 key 一个桶，每秒补充 tokensPerSecond 个令牌，
 * 桶满时最多容纳 burstSize 个令牌。
 */
export class TokenBucketRateLimiter implements RateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private tokensPerSecond = 10,
    private burstSize = 30,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.burstSize, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // 补充令牌
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    const refill = Math.floor(elapsedSec * this.tokensPerSecond);
    if (refill > 0) {
      bucket.tokens = Math.min(this.burstSize, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    const remaining = Math.floor(bucket.tokens);
    const allowed = bucket.tokens >= 1;
    if (allowed) {
      bucket.tokens -= 1;
    }

    return {
      allowed,
      remaining,
      limit: this.burstSize,
      retryAfterMs: allowed ? 0 : Math.ceil((1 / this.tokensPerSecond) * 1000),
    };
  }

  /** 清理过期桶（防止内存泄漏） */
  cleanup(maxAgeMs = 300_000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(key);
      }
    }
  }
}

// ===================== Audit Logger =====================

export interface AuditLogger {
  log(entry: AuditEntry): void;
}

export class ConsoleAuditLogger implements AuditLogger {
  private entries: AuditEntry[] = [];

  log(entry: AuditEntry) {
    this.entries.push(entry);
    // 只保留最近 1000 条在内存中
    if (this.entries.length > 1000) {
      this.entries = this.entries.slice(-500);
    }
  }

  getRecent(count = 50): AuditEntry[] {
    return this.entries.slice(-count);
  }

  /** 获取某操作的统计摘要 */
  getStats(): Record<string, { total: number; failed: number; avgMs: number }> {
    const stats = new Map<string, { total: number; failed: number; totalMs: number }>();
    for (const e of this.entries) {
      const s = stats.get(e.operation) || { total: 0, failed: 0, totalMs: 0 };
      s.total++;
      if (e.error) s.failed++;
      s.totalMs += e.durationMs;
      stats.set(e.operation, s);
    }
    const result: Record<string, { total: number; failed: number; avgMs: number }> = {};
    for (const [op, s] of stats) {
      result[op] = { total: s.total, failed: s.failed, avgMs: Math.round(s.totalMs / s.total) };
    }
    return result;
  }
}

// ===================== Gateway =====================

export class Gateway {
  private static instance: Gateway;

  private middlewares: Middleware[] = [];
  private authProvider: AuthProvider;
  private rateLimiter: RateLimiter;
  private auditLogger: AuditLogger;

  /** 速率限制豁免的来源 */
  private rateLimitExemptSources = new Set<RequestSource>(['internal']);

  private constructor() {
    this.authProvider = new ApiKeyAuthProvider();
    this.rateLimiter = new TokenBucketRateLimiter();
    this.auditLogger = new ConsoleAuditLogger();
  }

  static getInstance(): Gateway {
    if (!Gateway.instance) {
      Gateway.instance = new Gateway();
    }
    return Gateway.instance;
  }

  /** 重置（主要用于测试） */
  static resetInstance(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Gateway as any).instance = undefined;
  }

  // ========== 配置 ==========

  setAuthProvider(provider: AuthProvider) {
    this.authProvider = provider;
  }

  getAuthProvider(): AuthProvider {
    return this.authProvider;
  }

  setRateLimiter(limiter: RateLimiter) {
    this.rateLimiter = limiter;
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  setAuditLogger(logger: AuditLogger) {
    this.auditLogger = logger;
  }

  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /** 添加中间件 */
  use(mw: Middleware) {
    this.middlewares.push(mw);
  }

  /** 添加速率限制豁免来源 */
  addRateLimitExemptSource(source: RequestSource) {
    this.rateLimitExemptSources.add(source);
  }

  // ========== 核心处理 ==========

  /**
   * 创建标准请求对象。
   * 这是所有外部入口生成 Request 的唯一方式，保证 traceId 等字段一致性。
   */
  createRequest(opts: {
    source: RequestSource;
    operation: string;
    payload: unknown;
    auth?: Request['auth'];
    meta?: Request['meta'];
  }): Request {
    return {
      id: randomUUID(),
      source: opts.source,
      operation: opts.operation,
      payload: opts.payload,
      auth: opts.auth,
      meta: opts.meta,
      timestamp: Date.now(),
    };
  }

  /**
   * 处理请求 — 经中间件管道后返回响应。
   *
   * 内置三个默认中间件（按此顺序）:
   *   1. 认证校验 (Authentication)
   *   2. 速率限制 (Rate Limiting)
   *   3. 审计日志 (Audit Logging)
   */
  async handle(req: Request): Promise<Response> {
    const t0 = Date.now();

    // 构建中间件管道: 默认中间件 + 用户自定义
    const pipeline = [
      // 内建: 认证
      this.authMiddleware.bind(this),
      // 内建: 限速
      this.rateLimitMiddleware.bind(this),
      // 用户自定义
      ...this.middlewares,
      // 内建: 审计（最后记录）
      this.auditMiddleware.bind(this),
    ];

    // 洋葱模型执行
    const finalHandler = (req: Request): Promise<Response> => {
      return Promise.resolve({
        success: true,
        requestId: req.id,
        durationMs: Date.now() - t0,
      });
    };

    const compose = (
      middlewares: Middleware[],
      last: (req: Request) => Promise<Response>,
    ): ((req: Request) => Promise<Response>) => {
      return (req: Request) => {
        if (middlewares.length === 0) return last(req);
        const [first, ...rest] = middlewares;
        return first(req, () => compose(rest, last)(req));
      };
    };

    try {
      const handler = compose(pipeline, finalHandler);
      return await handler(req);
    } catch (err) {
      // 未捕获异常 — 兜底返回错误响应
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        requestId: req.id,
        durationMs: Date.now() - t0,
        error: `Gateway internal error: ${errorMsg}`,
      };
    }
  }

  // ========== 内建中间件 ==========

  private async authMiddleware(req: Request, next: () => Promise<Response>): Promise<Response> {
    const result = await this.authProvider.authenticate(req);
    if (!result.allowed) {
      return {
        success: false,
        requestId: req.id,
        durationMs: 0,
        error: `Authentication failed: ${result.reason || 'Access denied'}`,
      };
    }
    // 注入 userId 到 meta
    if (!req.meta) req.meta = {};
    if (!req.meta.sessionId) req.meta.sessionId = result.userId;
    return next();
  }

  private async rateLimitMiddleware(req: Request, next: () => Promise<Response>): Promise<Response> {
    // 豁免来源不检查速率限制
    if (this.rateLimitExemptSources.has(req.source)) {
      return next();
    }

    const key = req.meta?.rateLimitKey || `${req.source}:${req.meta?.ip || 'local'}:${req.auth?.userId || 'anon'}`;
    const result = await this.rateLimiter.check(key);

    if (!result.allowed) {
      return {
        success: false,
        requestId: req.id,
        durationMs: 0,
        error: `Rate limit exceeded. Retry after ${result.retryAfterMs}ms. Limit: ${result.limit} req/s`,
      };
    }
    return next();
  }

  private async auditMiddleware(req: Request, next: () => Promise<Response>): Promise<Response> {
    const resp = await next();
    this.auditLogger.log({
      requestId: req.id,
      source: req.source,
      operation: req.operation,
      userId: req.meta?.sessionId,
      timestamp: req.timestamp,
      durationMs: resp.durationMs,
      allowed: resp.success,
      error: resp.error,
    });
    return resp;
  }
}
