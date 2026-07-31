import { watch } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';

/** Directories that should always be excluded from file watching. */
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  '.next',
  '.nuxt',
  'build',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.cache',
  'tmp',
  'temp',
  '.turbo',
  '.storybook',
  'out',
  'target', // Rust/C++ build output
];

/** File extensions to exclude from watching. */
const DEFAULT_EXCLUDE_EXTENSIONS = [
  '.log',
  '.bak',
  '.swp',
  '.swo',
  '.DS_Store',
  'Thumbs.db',
  '.pyc',
  '.pyo',
  '.class',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.min.js',
  '.min.css',
  '.map',
];

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

    // ── Load custom hooks from .codeyang-hooks.json ──
    const hooks = this.loadHooks(projectDir);

    for (const rule of this.rules) {
      try {
        if (rule.source.type === 'file') {
          this.startFileWatcher(projectDir, rule, hooks);
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
    if (hooks.commands.length > 0) {
      logger.info(`[Watcher] Loaded ${hooks.commands.length} custom hook(s) from .codeyang-hooks.json`);
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

  /**
   * Check if a path should be excluded based on default exclude lists.
   * Normalizes path separators for cross-platform compatibility (Windows uses \).
   * This runs in addition to any user-supplied condition.
   */
  private isExcludedPath(filePath: string): boolean {
    // Normalize to forward slashes for consistent pattern matching (Windows uses \)
    const rel = relative(process.cwd(), filePath).replace(/[\\]/g, '/');

    // Check directory exclusions
    for (const dir of DEFAULT_EXCLUDE_DIRS) {
      if (rel === dir || rel.startsWith(dir + '/') || rel.includes('/' + dir + '/')) {
        return true;
      }
    }

    // Check file extension exclusions (case-insensitive for cross-platform)
    const lowerPath = filePath.toLowerCase();
    for (const ext of DEFAULT_EXCLUDE_EXTENSIONS) {
      if (lowerPath.endsWith(ext)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Load custom hooks from .codeyang-hooks.json in the project root.
   *
   * Format:
   * {
   *   "onFileChange": [
   *     { "pattern": "\\.ts$", "command": "npm run type-check" },
   *     { "pattern": "\\.test\\.ts$", "command": "npm test -- --run" }
   *   ]
   * }
   */
  private loadHooks(projectDir: string): { commands: Array<{ pattern: RegExp; command: string }> } {
    const hooksPath = join(projectDir, '.codeyang-hooks.json');
    try {
      if (!existsSync(hooksPath)) return { commands: [] };
      const raw = readFileSync(hooksPath, 'utf-8');
      const config = JSON.parse(raw);
      if (!Array.isArray(config.onFileChange)) return { commands: [] };

      const commands = config.onFileChange
        .filter(
          (h: unknown) =>
            h &&
            typeof h === 'object' &&
            typeof (h as Record<string, unknown>).pattern === 'string' &&
            typeof (h as Record<string, unknown>).command === 'string',
        )
        .map((h: { pattern: string; command: string }) => ({
          pattern: new RegExp(h.pattern),
          command: h.command,
        }));

      return { commands };
    } catch (err) {
      logger.warn(`[Watcher] Failed to load .codeyang-hooks.json: ${err instanceof Error ? err.message : String(err)}`);
      return { commands: [] };
    }
  }

  /**
   * Execute custom hooks matching the changed file.
   */
  private async executeHooks(
    hooks: Array<{ pattern: RegExp; command: string }>,
    filePath: string,
    projectDir: string,
  ): Promise<void> {
    const relPath = relative(projectDir, filePath).replace(/[\\]/g, '/');
    for (const hook of hooks) {
      if (hook.pattern.test(relPath)) {
        // Fire and forget — don't block the watcher
        execa(hook.command, { shell: true, cwd: projectDir })
          .then((result) => {
            if (result.stdout?.trim()) {
              logger.info(`[Hook] ${hook.command}: ${result.stdout.trim().slice(0, 200)}`);
            }
          })
          .catch((err) => {
            logger.warn(`[Hook] ${hook.command} failed: ${err instanceof Error ? err.message : String(err)}`);
          });
      }
    }
  }

  private startFileWatcher(
    projectDir: string,
    rule: TriggerRule,
    hooks?: { commands: Array<{ pattern: RegExp; command: string }> },
  ): void {
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
          // Built-in path exclusion (node_modules, dist, .git, etc.)
          if (this.isExcludedPath(fullPath)) continue;
          // User-supplied condition filter
          if (rule.condition && !rule.condition({ filePath: fullPath })) continue;
          const existing = debounceTimers.get(fullPath);
          if (existing) clearTimeout(existing);
          debounceTimers.set(
            fullPath,
            setTimeout(() => {
              debounceTimers.delete(fullPath);
              this.onTrigger(rule, { filePath: fullPath });
              // Execute custom hooks on file change
              if (hooks?.commands.length) {
                this.executeHooks(hooks.commands, fullPath, projectDir);
              }
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
