/**
 * Diagnostics command - Run system health check
 */
import type { CommandContext, DispatchResult } from './types.js';
import { SelfDiagnostic } from '../diagnostics/index.js';
import picocolors from 'picocolors';

const c = picocolors;

export async function cmdDiagnostics(ctx: CommandContext): Promise<DispatchResult> {
  const diagnostic = new SelfDiagnostic();

  console.log('');
  console.log(c.cyan('Running health check...'));
  console.log('');

  const report = await diagnostic.runHealthCheck();

  // 使用彩色输出
  console.log(c.bold(c.cyan('═'.repeat(60))));
  console.log(c.bold(c.cyan('CodeYang Health Check Report')));
  console.log(c.bold(c.cyan('═'.repeat(60))));
  console.log('');
  console.log(`Timestamp: ${c.dim(new Date(report.timestamp).toLocaleString())}`);

  // 整体状态
  const statusColor = report.overall === 'healthy' ? c.green : report.overall === 'degraded' ? c.yellow : c.red;
  console.log(`Overall Status: ${statusColor(report.overall.toUpperCase())}`);
  console.log('');

  // 摘要
  console.log(c.bold('Summary'));
  console.log('─'.repeat(60));
  console.log(`Total Checks: ${report.summary.total}`);
  console.log(`${c.green('✓')} Passed: ${c.green(report.summary.passed.toString())}`);
  console.log(`${c.yellow('⚠')} Warnings: ${c.yellow(report.summary.warned.toString())}`);
  console.log(`${c.red('✗')} Failed: ${c.red(report.summary.failed.toString())}`);
  console.log('');

  // 显示各个类别的结果
  const categories = [
    { key: 'environment', name: 'Environment', results: report.environment },
    { key: 'llm', name: 'LLM Connection', results: report.llm },
    { key: 'tools', name: 'Tools', results: report.tools },
    { key: 'filesystem', name: 'File System', results: report.filesystem },
    { key: 'network', name: 'Network', results: report.network },
  ];

  for (const category of categories) {
    if (category.results.length > 0) {
      console.log(c.bold(category.name));
      console.log('─'.repeat(60));

      for (const result of category.results) {
        const icon = result.status === 'pass' ? c.green('✓') : result.status === 'warn' ? c.yellow('⚠') : c.red('✗');

        const messageColor = result.status === 'pass' ? c.dim : result.status === 'warn' ? c.yellow : c.red;

        console.log(`${icon} ${result.name}: ${messageColor(result.message)}`);

        if (result.suggestion) {
          console.log(`  ${c.yellow('→')} ${c.yellow(result.suggestion)}`);
        }
      }
      console.log('');
    }
  }

  console.log(c.bold(c.cyan('═'.repeat(60))));
  console.log('');

  ctx.ui.promptUser();
  return { handled: true };
}
