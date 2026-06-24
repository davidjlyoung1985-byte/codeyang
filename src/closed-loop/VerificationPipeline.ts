import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface VerificationResult {
  filePath: string;
  passed: boolean;
  tool: 'lint' | 'typecheck' | 'test';
  output: string;
  durationMs: number;
}

const LINT_TIMEOUT = 30_000;
const TYPECHECK_TIMEOUT = 60_000;

export class VerificationPipeline {
  private maxFixIterations = 3;
  private tscCache: { stdout: string; stderr: string; timestamp: number } | null = null;
  private tscCacheTTL = 30_000; // 30s cache TTL
  private tscRunning: Promise<VerificationResult | null> | null = null; // 并发锁

  constructor(private projectDir: string) {}

  setMaxFixIterations(n: number): void {
    this.maxFixIterations = Math.max(1, Math.min(10, n));
  }

  async run(filePath: string): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      results.push(await this.runLint(filePath));
      // 使用缓存的 tsc 结果
      const tscResult = await this.runTscOnce();
      if (tscResult) {
        const lines = tscResult.output.split('\n').filter((l) => l.includes(filePath));
        results.push({
          filePath,
          passed: lines.length === 0,
          tool: 'typecheck',
          output: lines.length > 0 ? lines.join('\n').trim() : '(no type errors)',
          durationMs: 0,
        });
      }
    }

    return results;
  }

  /** 批量运行，共享 tsc 缓存 */
  async runBatch(filePaths: string[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const tsFiles = filePaths.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

    if (tsFiles.length === 0) return results;

    // 批量 lint（每个文件单独跑，但共享 tsc 缓存）
    for (const fp of tsFiles) {
      results.push(await this.runLint(fp));
    }

    // 单次 tsc 共享给所有文件
    const tscResult = await this.runTscOnce();
    if (tscResult) {
      for (const fp of tsFiles) {
        const lines = tscResult.output.split('\n').filter((l) => l.includes(fp));
        results.push({
          filePath: fp,
          passed: lines.length === 0,
          tool: 'typecheck',
          output: lines.length > 0 ? lines.join('\n').trim() : '(no type errors)',
          durationMs: 0,
        });
      }
    }

    return results;
  }

  /** 只运行一次 tsc，结果缓存复用（带并发锁） */
  private async runTscOnce(): Promise<VerificationResult | null> {
    if (!existsSync(resolve(this.projectDir, 'tsconfig.json'))) return null;

    // 检查缓存是否有效
    const now = Date.now();
    if (this.tscCache && now - this.tscCache.timestamp < this.tscCacheTTL) {
      const all = this.tscCache.stdout || this.tscCache.stderr || '';
      return {
        filePath: '',
        passed: false,
        tool: 'typecheck',
        output: all,
        durationMs: 0,
      };
    }

    // 并发锁：如果已有 tsc 在运行，等待它完成
    if (this.tscRunning) {
      return this.tscRunning;
    }

    const t0 = Date.now();
    // 创建锁并存储
    this.tscRunning = (async () => {
      try {
        const { stdout, stderr } = await execa('npx', ['tsc', '--noEmit', '--pretty', 'false', '--incremental'], {
          cwd: this.projectDir,
          timeout: TYPECHECK_TIMEOUT,
          reject: false,
        });
        this.tscCache = { stdout: stdout || '', stderr: stderr || '', timestamp: Date.now() };
        const all = stdout || stderr || '';
        return {
          filePath: '',
          passed: !all,
          tool: 'typecheck',
          output: all || '(no type errors)',
          durationMs: Date.now() - t0,
        };
      } catch (err) {
        return {
          filePath: '',
          passed: false,
          tool: 'typecheck',
          output: `tsc failed: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - t0,
        };
      } finally {
        this.tscRunning = null; // 释放锁
      }
    })();

    return this.tscRunning;
  }

  async verifyWithFix(filePath: string): Promise<{ results: VerificationResult[]; fixed: boolean }> {
    for (let i = 0; i < this.maxFixIterations; i++) {
      const results = await this.run(filePath);
      const errors = results.filter((r) => !r.passed);
      if (errors.length === 0) return { results, fixed: i > 0 };

      const hasFixable = errors.some((r) => this.isFixable(r));
      if (!hasFixable) return { results, fixed: i > 0 };

      await this.autoFix(errors);
    }
    return { results: await this.run(filePath), fixed: true };
  }

  private async runLint(filePath: string): Promise<VerificationResult> {
    const t0 = Date.now();
    try {
      const { stdout, stderr } = await execa('npx', ['eslint', filePath, '--no-ignore', '--format', 'stylish'], {
        cwd: this.projectDir,
        timeout: LINT_TIMEOUT,
        reject: false,
      });
      const output = (stdout || stderr || '').trim();
      return {
        filePath,
        passed: !output,
        tool: 'lint',
        output: output || '(no issues)',
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        filePath,
        passed: false,
        tool: 'lint',
        output: `ESLint check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - t0,
      };
    }
  }

  private async autoFix(errors: VerificationResult[]): Promise<void> {
    for (const err of errors) {
      if (err.tool === 'lint') {
        try {
          await execa('npx', ['eslint', err.filePath, '--fix'], {
            cwd: this.projectDir,
            timeout: LINT_TIMEOUT,
            reject: false,
          });
        } catch {
          // best-effort
        }
      }
    }
  }

  private isFixable(result: VerificationResult): boolean {
    return result.tool === 'lint';
  }

  formatSummary(results: VerificationResult[]): string {
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);

    if (failed.length === 0) {
      return `[Auto-Verify] All checks passed (${passed.map((r) => r.tool).join(', ')})`;
    }

    const lines: string[] = [`[Auto-Verify] ${failed.length} check(s) failed:`];
    for (const f of failed) {
      const preview = f.output.slice(0, 400);
      lines.push(`  ${f.tool} (${f.durationMs}ms):`);
      for (const l of preview.split('\n')) {
        lines.push(`    ${l}`);
      }
    }
    return lines.join('\n');
  }
}
