/**
 * ==========================================================
 *  L5: 评估与观测层 — 全链路追踪 (Distributed Tracing)
 * ==========================================================
 *
 * 职责:
 *   1. 链路追踪 — 从请求入口到工具执行的完整 Span 树
 *   2. 性能观测 — 记录每个 Span 的耗时、状态、错误
 *   3. 结构化日志 — 将追踪数据导出为结构化格式（兼容 OpenTelemetry）
 *   4. 可视化 — 提供 Trace 概览和查询
 *
 * 数据结构:
 *   Trace (一条请求) → Span[] (一系列有父子关系的步骤)
 *
 * 使用方式:
 *   const tracer = Tracer.getInstance();
 *   const span = tracer.startSpan('agent.run', { requestId });
 *   // ... do work ...
 *   span.end({ success: true });
 *
 * 集成点（见 Agent.ts / index.ts）:
 *   - Agent.run() 入口创建 trace
 *   - 每次 LLM 调用创建一个 span
 *   - 每次工具执行创建一个子 span
 *   - 闭环验证/反思等也创建各自的 span
 */

import { randomUUID } from 'node:crypto';

// ===================== 类型定义 =====================

export type SpanStatus = 'ok' | 'error' | 'warning';

export interface Span {
  /** Span 唯一 ID */
  id: string;
  /** 所属 Trace ID */
  traceId: string;
  /** 父 Span ID（根 Span 为 null） */
  parentId: string | null;
  /** Span 名称（如 "agent.run", "tool.execute", "llm.stream"） */
  name: string;
  /** 操作分类（用于检索和统计） */
  category: 'agent' | 'llm' | 'tool' | 'plan' | 'verify' | 'reflect' | 'critique' | 'memory' | 'gateway' | 'other';
  /** 开始时间戳 ms */
  startTime: number;
  /** 结束时间戳 ms（未结束为 0） */
  endTime: number;
  /** 耗时 ms */
  durationMs: number;
  /** 状态 */
  status: SpanStatus;
  /** 标签 — 键值对元数据 */
  tags: Record<string, string | number | boolean | undefined>;
  /** 错误信息（仅 status=error 时） */
  error?: string;
  /** 关联的请求/资源 ID */
  relatedId?: string;
}

export interface Trace {
  /** Trace 唯一 ID */
  id: string;
  /** Trace 名称（如 "User request"） */
  name: string;
  /** 来源标识 */
  source: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 总耗时 ms */
  totalDurationMs: number;
  /** 包含的 Span 数量 */
  spanCount: number;
  /** 最终状态 */
  status: SpanStatus;
  /** 根操作 */
  rootOperation: string;
}

export interface TraceSummary {
  trace: Trace;
  spans: Span[];
  /** 按分类统计 */
  byCategory: Record<string, { count: number; avgMs: number; errorCount: number }>;
  /** 耗时最长 Top-N Span */
  slowestSpans: Span[];
}

export type ExportFormat = 'json' | 'otel' | 'compact';

export interface TracerExporter {
  /** 导出一条完整的 Trace */
  export(trace: TraceSummary): void;
}

// ===================== Tracer =====================

export class Tracer {
  private static instance: Tracer;

  /** 活跃的 Span 栈（每个 traceId 一个栈） */
  private activeSpans = new Map<string, Span[]>();
  /** 所有已完成的 Span */
  private completedSpans = new Map<string, Span[]>();
  /** 已完成的 Trace */
  private completedTraces = new Map<string, Trace>();
  /** 导出器列表 */
  private exporters: TracerExporter[] = [];
  /** 是否启用 */
  private enabled = true;
  /** 最大保留 Span 数（防止内存泄漏） */
  private maxSpans = 5000;

  private constructor() {}

  static getInstance(): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer();
    }
    return Tracer.instance;
  }

  /** 重置（测试用） */
  static resetInstance(): void {
    Tracer.instance = undefined!;
  }

  // ========== 配置 ==========

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setMaxSpans(n: number) {
    this.maxSpans = n;
  }

  addExporter(exporter: TracerExporter) {
    this.exporters.push(exporter);
  }

  // ========== Trace 管理 ==========

  /**
   * 创建一个新的 Trace（根 Span 自动创建）。
   * 返回 traceId。
   */
  startTrace(opts: { name: string; source: string; rootOperation: string }): string {
    if (!this.enabled) return '';

    const traceId = randomUUID();
    const now = Date.now();

    // 预创建 Trace 记录
    const trace: Trace = {
      id: traceId,
      name: opts.name,
      source: opts.source,
      rootOperation: opts.rootOperation,
      startTime: now,
      endTime: 0,
      totalDurationMs: 0,
      spanCount: 0,
      status: 'ok',
    };
    this.completedTraces.set(traceId, trace);
    this.completedSpans.set(traceId, []);
    this.activeSpans.set(traceId, []);

    return traceId;
  }

  /** 结束一个 Trace（自动关闭所有未关闭的 Span） */
  endTrace(traceId: string) {
    if (!this.enabled || !traceId) return;

    const trace = this.completedTraces.get(traceId);
    if (!trace) return;

    // 关闭所有未关闭的活跃 Span
    const stack = this.activeSpans.get(traceId);
    if (stack && stack.length > 0) {
      for (const span of [...stack].reverse()) {
        this.endSpan(span, { status: 'warning', error: 'Trace ended before span was closed' });
      }
    }
    this.activeSpans.delete(traceId);

    // 更新 Trace 汇总信息
    const spans = this.completedSpans.get(traceId) || [];
    trace.endTime = Date.now();
    trace.totalDurationMs = trace.endTime - trace.startTime;
    trace.spanCount = spans.length;
    trace.status = spans.some((s) => s.status === 'error') ? 'error' : 'ok';

    // 导出
    if (this.exporters.length > 0) {
      const summary = this.getTraceSummary(traceId);
      if (summary) {
        for (const exporter of this.exporters) {
          try {
            exporter.export(summary);
          } catch {
            // 导出失败不中断主流程
          }
        }
      }
    }

    // 内存保护：超出上限时丢弃最早的数据
    this.enforceMemoryLimit();
  }

  // ========== Span 管理 ==========

  /**
   * 开始一个 Span，自动关联当前 Trace 的栈顶 Span 为父节点。
   * 如果当前 traceId 没有活跃 Span，则创建的 Span 为根级子节点。
   */
  startSpan(
    name: string,
    opts: {
      traceId: string;
      category: Span['category'];
      tags?: Record<string, string | number | boolean | undefined>;
      relatedId?: string;
      parentId?: string;
    },
  ): Span {
    if (!this.enabled || !opts.traceId) {
      // 返回一个 noop span
      return this.createNoopSpan();
    }

    const now = Date.now();
    const stack = this.activeSpans.get(opts.traceId);
    let parentId: string | null = opts.parentId || null;

    // 自动推断父 Span
    if (!parentId && stack && stack.length > 0) {
      parentId = stack[stack.length - 1].id;
    }

    const span: Span = {
      id: randomUUID(),
      traceId: opts.traceId,
      parentId,
      name,
      category: opts.category,
      startTime: now,
      endTime: 0,
      durationMs: 0,
      status: 'ok',
      tags: opts.tags || {},
      relatedId: opts.relatedId,
    };

    // 压入活跃栈
    if (stack) {
      stack.push(span);
    } else {
      this.activeSpans.set(opts.traceId, [span]);
    }

    // 返回可链式调用的对象
    return span;
  }

  /**
   * 结束一个 Span，计算耗时并记录到已完成列表。
   */
  endSpan(
    span: Span,
    opts?: { status?: SpanStatus; error?: string; tags?: Record<string, string | number | boolean | undefined> },
  ) {
    if (!this.enabled || !span.id) return;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;

    if (opts?.status) span.status = opts.status;
    if (opts?.error) {
      span.error = opts.error;
      span.status = 'error';
    }
    if (opts?.tags) {
      Object.assign(span.tags, opts.tags);
    }

    // 从活跃栈弹出
    const stack = this.activeSpans.get(span.traceId);
    if (stack) {
      const idx = stack.findIndex((s) => s.id === span.id);
      if (idx !== -1) {
        stack.splice(idx, 1);
      }
    }

    // 记录到已完成
    const completed = this.completedSpans.get(span.traceId);
    if (completed) {
      completed.push(span);
    }
  }

  // ========== 便捷包装 ==========

  /**
   * 创建一个子 span 并自动结束，适合 async/await 模式。
   *
   * 用法:
   *   const result = await tracer.traceAsync(traceId, 'tool.execute', 'tool', async (span) => {
   *     span.tags.filePath = filePath;
   *     return await execute(filePath);
   *   });
   */
  async traceAsync<T>(
    traceId: string,
    name: string,
    category: Span['category'],
    fn: (span: Span) => Promise<T>,
    opts?: { tags?: Record<string, string | number | boolean | undefined>; relatedId?: string },
  ): Promise<T> {
    const span = this.startSpan(name, { traceId, category, tags: opts?.tags, relatedId: opts?.relatedId });
    try {
      const result = await fn(span);
      this.endSpan(span);
      return result;
    } catch (err) {
      this.endSpan(span, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ========== 查询 ==========

  /** 获取所有 Traces 概览 */
  getTraces(limit = 50): Trace[] {
    return [...this.completedTraces.values()].sort((a, b) => b.startTime - a.startTime).slice(0, limit);
  }

  /** 获取某个 Trace 的完整详情 */
  getTraceSummary(traceId: string): TraceSummary | null {
    const trace = this.completedTraces.get(traceId);
    const spans = this.completedSpans.get(traceId);
    if (!trace || !spans) return null;

    // 按分类统计
    const byCategory: Record<string, { count: number; avgMs: number; errorCount: number }> = {};
    for (const s of spans) {
      const cat = s.category;
      if (!byCategory[cat]) byCategory[cat] = { count: 0, avgMs: 0, errorCount: 0 };
      byCategory[cat].count++;
      byCategory[cat].avgMs += s.durationMs;
      if (s.status === 'error') byCategory[cat].errorCount++;
    }
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].avgMs = Math.round(byCategory[cat].avgMs / byCategory[cat].count);
    }

    // 耗时最长 Top-5
    const slowestSpans = [...spans].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);

    return { trace, spans, byCategory, slowestSpans };
  }

  /** 按分类查询最近的 Span */
  querySpans(opts: { category?: Span['category']; status?: SpanStatus; limit?: number }): Span[] {
    const allSpans: Span[] = [];
    for (const spans of this.completedSpans.values()) {
      allSpans.push(...spans);
    }

    let filtered = allSpans;
    if (opts.category) filtered = filtered.filter((s) => s.category === opts.category);
    if (opts.status) filtered = filtered.filter((s) => s.status === opts.status);

    return filtered.sort((a, b) => b.startTime - a.startTime).slice(0, opts.limit || 50);
  }

  /** 导出 Trace 为指定格式的字符串 */
  exportTrace(traceId: string, format: ExportFormat = 'compact'): string {
    const summary = this.getTraceSummary(traceId);
    if (!summary) return 'Trace not found';

    switch (format) {
      case 'json':
        return JSON.stringify(summary, null, 2);

      case 'compact':
        return this.formatCompact(summary);

      case 'otel':
        return this.formatOTel(summary);

      default:
        return JSON.stringify(summary);
    }
  }

  // ========== 内部方法 ==========

  private createNoopSpan(): Span {
    return {
      id: '',
      traceId: '',
      parentId: null,
      name: 'noop',
      category: 'other',
      startTime: 0,
      endTime: 0,
      durationMs: 0,
      status: 'ok',
      tags: {},
    };
  }

  private formatCompact(summary: TraceSummary): string {
    const lines: string[] = [];
    const { trace, spans, byCategory, slowestSpans } = summary;

    lines.push(`Trace: ${trace.id.slice(0, 12)} | ${trace.name} | ${trace.source}`);
    lines.push(`Duration: ${trace.totalDurationMs}ms | Spans: ${trace.spanCount} | Status: ${trace.status}`);
    lines.push('');

    // 按分类统计
    lines.push('By Category:');
    for (const [cat, stats] of Object.entries(byCategory)) {
      const errStr = stats.errorCount > 0 ? ` (${stats.errorCount} errors)` : '';
      lines.push(`  ${cat.padEnd(12)} ${stats.count} spans, avg ${stats.avgMs}ms${errStr}`);
    }

    // 最慢的 Span
    if (slowestSpans.length > 0) {
      lines.push('');
      lines.push('Slowest Spans:');
      for (const s of slowestSpans) {
        const errStr = s.status === 'error' ? ` ERROR: ${s.error?.slice(0, 60)}` : '';
        lines.push(`  ${s.durationMs.toString().padStart(6)}ms  ${s.name} (${s.category})${errStr}`);
      }
    }

    // 完整 Span 树（缩进表示层级）
    if (spans.length <= 50) {
      lines.push('');
      lines.push('Span Tree:');
      const printTree = (parentId: string | null, indent: number) => {
        for (const s of spans) {
          if (s.parentId === parentId) {
            const statusIcon = s.status === 'ok' ? '✓' : s.status === 'error' ? '✗' : '⚠';
            const info = s.relatedId ? ` [${s.relatedId}]` : '';
            lines.push(`${'  '.repeat(indent)}${statusIcon} ${s.name} (${s.durationMs}ms)${info}`);
            printTree(s.id, indent + 1);
          }
        }
      };
      printTree(null, 0);
    }

    return lines.join('\n');
  }

  private formatOTel(summary: TraceSummary): string {
    // 简化的 OpenTelemetry JSON 格式
    const entries = summary.spans.map((s) => ({
      traceId: s.traceId,
      spanId: s.id,
      parentSpanId: s.parentId || '',
      name: s.name,
      kind: 'INTERNAL',
      startTime: s.startTime * 1_000_000, // 转为纳秒
      endTime: s.endTime * 1_000_000,
      status: { code: s.status === 'ok' ? 1 : 2, message: s.error || '' },
      attributes: Object.entries(s.tags).reduce(
        (acc, [k, v]) => {
          if (v !== undefined) acc[`codeyang.${k}`] = v;
          return acc;
        },
        {} as Record<string, string | number | boolean>,
      ),
    }));

    return JSON.stringify(
      {
        resourceSpans: [
          {
            resource: { attributes: { 'service.name': 'codeyang', 'service.version': '0.7.0' } },
            scopeSpans: [{ scope: { name: 'codeyang.tracer' }, spans: entries }],
          },
        ],
      },
      null,
      2,
    );
  }

  /** 丢弃最老的数据以控制内存 */
  private enforceMemoryLimit() {
    let totalSpans = 0;
    for (const spans of this.completedSpans.values()) {
      totalSpans += spans.length;
    }

    if (totalSpans <= this.maxSpans) return;

    // 按时间排序 Trace，丢弃最老的
    const sortedTraces = [...this.completedTraces.entries()].sort((a, b) => a[1].startTime - b[1].startTime);

    while (totalSpans > this.maxSpans && sortedTraces.length > 0) {
      const [oldestId] = sortedTraces.shift()!;
      const spansToRemove = this.completedSpans.get(oldestId)?.length || 0;
      this.completedSpans.delete(oldestId);
      this.completedTraces.delete(oldestId);
      totalSpans -= spansToRemove;
    }
  }
}
