import { watch } from 'node:fs/promises';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';

export type TriggerSource =
  | { type: 'file'; pattern: string }
  | { type: 'post-tool'; toolNames: string[] }
  | { type: 'timer'; intervalMs: number };

export interface TriggerContext {
  filePath: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export type TriggerAction = 'auto-verify' | 'auto-fix' | 'auto-test' | 'notify';

export interface TriggerRule {
  id: string;
  source: TriggerSource;
  action: TriggerAction;
  condition?: (ctx: TriggerContext) => boolean;
  label?: string;
}

export class WatcherSystem {
  private rules: TriggerRule[] = [];
  private abortControllers: AbortController[] = [];
  private timerIds: ReturnType<typeof setInterval>[] = [];
  private active = false;
  private onTrigger: (rule: TriggerRule, ctx: TriggerContext) => void;

  constructor(onTrigger: (rule: TriggerRule, ctx: TriggerContext) => void) {
    this.onTrigger = onTrigger;
  }

  addRule(rule: TriggerRule): void {
    this.rules.push(rule);
  }

  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  get activeRules(): TriggerRule[] {
    return [...this.rules];
  }

  start(projectDir: string): void {
    if (this.active) return;
    this.active = true;

    for (const rule of this.rules) {
      try {
        if (rule.source.type === 'file') {
          this.startFileWatcher(projectDir, rule);
        } else if (rule.source.type === 'timer') {
          this.startTimer(rule);
        }
      } catch (err: unknown) {
        logger.warn(`[Watcher] Failed to start rule "${rule.id}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const fileRules = this.rules.filter((r) => r.source.type === 'file').length;
    const timerRules = this.rules.filter((r) => r.source.type === 'timer').length;
    const postToolRules = this.rules.filter((r) => r.source.type === 'post-tool').length;
    if (fileRules > 0 || timerRules > 0) {
      logger.info(`[Watcher] Started: ${fileRules} file, ${timerRules} timer, ${postToolRules} post-tool rules`);
    }
  }

  stop(): void {
    this.active = false;
    for (const ac of this.abortControllers) {
      try {
        ac.abort();
      } catch {
        /* ignore */
      }
    }
    for (const id of this.timerIds) {
      clearInterval(id);
    }
    this.abortControllers = [];
    this.timerIds = [];
  }

  checkPostTool(ctx: TriggerContext): void {
    if (!this.active) return;
    for (const rule of this.rules) {
      if (rule.source.type !== 'post-tool') continue;
      if (!rule.source.toolNames.includes(ctx.toolName ?? '')) continue;
      if (rule.condition && !rule.condition(ctx)) continue;
      this.onTrigger(rule, ctx);
    }
  }

  private startFileWatcher(projectDir: string, rule: TriggerRule): void {
    if (rule.source.type !== 'file') return;
    const ac = new AbortController();
    this.abortControllers.push(ac);
    const pattern = new RegExp(rule.source.pattern);
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    void (async () => {
      try {
        const watcher = watch(projectDir, { recursive: true, signal: ac.signal });
        for await (const event of watcher) {
          if (!event.filename || !pattern.test(event.filename)) continue;
          const fullPath = resolve(projectDir, event.filename);
          // 检查 condition 过滤（排除 node_modules、dist 等）
          if (rule.condition && !rule.condition({ filePath: fullPath })) continue;
          const existing = debounceTimers.get(fullPath);
          if (existing) clearTimeout(existing);
          debounceTimers.set(
            fullPath,
            setTimeout(() => {
              debounceTimers.delete(fullPath);
              this.onTrigger(rule, { filePath: fullPath });
            }, 300),
          );
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code !== 'ABORT_ERR') {
          logger.warn(`[Watcher] File watcher error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();
  }

  private startTimer(rule: TriggerRule): void {
    if (rule.source.type !== 'timer') return;
    const id = setInterval(() => {
      if (!this.active) {
        clearInterval(id);
        return;
      }
      this.onTrigger(rule, { filePath: '' });
    }, rule.source.intervalMs);
    this.timerIds.push(id);
  }

  get isActive(): boolean {
    return this.active;
  }

  get ruleCount(): number {
    return this.rules.length;
  }
}
