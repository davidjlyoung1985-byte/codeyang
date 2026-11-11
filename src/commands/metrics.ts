/**
 * Metrics command - Display performance metrics
 */
import type { CommandContext, DispatchResult } from './types.js';
import { getToolMetrics } from '../metrics/index.js';
import picocolors from 'picocolors';

const c = picocolors;

export function cmdMetrics(line: string, ctx: CommandContext): DispatchResult {
  const args = line.trim().split(/\s+/).slice(1);
  const command = args[0]?.toLowerCase();

  const metrics = getToolMetrics();

  // /metrics reset - 重置所有指标
  if (command === 'reset') {
    metrics.reset();
    console.log(c.green('✓ Performance metrics have been reset'));
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /metrics export - 导出指标数据
  if (command === 'export') {
    const data = metrics.exportData();
    console.log(JSON.stringify(data, null, 2));
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /metrics [tool] - 显示单个工具的指标
  if (command && command !== 'reset' && command !== 'export') {
    const metric = metrics.getToolMetric(command);
    if (!metric) {
      console.log(c.red(`✗ No metrics found for tool: ${command}`));
      ctx.ui.promptUser();
      return { handled: true };
    }

    console.log('');
    console.log(c.bold(c.cyan(`Tool: ${metric.tool}`)));
    console.log('─'.repeat(60));
    console.log(`Calls:        ${c.yellow(metric.calls.toString())}`);
    console.log(`Success Rate: ${c.green((metric.successRate * 100).toFixed(1) + '%')}`);
    console.log(
      `Error Rate:   ${metric.errorRate > 0.1 ? c.red((metric.errorRate * 100).toFixed(1) + '%') : c.dim((metric.errorRate * 100).toFixed(1) + '%')}`,
    );
    console.log(
      `Avg Time:     ${metric.avgTime > 1000 ? c.yellow(metric.avgTime.toFixed(0) + 'ms') : c.dim(metric.avgTime.toFixed(0) + 'ms')}`,
    );
    console.log(`Min Time:     ${c.dim(metric.minTime.toFixed(0) + 'ms')}`);
    console.log(`Max Time:     ${c.dim(metric.maxTime.toFixed(0) + 'ms')}`);
    console.log(`Last Used:    ${c.dim(new Date(metric.lastUsed).toLocaleString())}`);
    console.log('');
    ctx.ui.promptUser();
    return { handled: true };
  }

  // /metrics - 显示完整报告
  const report = metrics.getReport();

  console.log('');
  console.log(c.bold(c.cyan('═'.repeat(60))));
  console.log(c.bold(c.cyan('Tool Performance Report')));
  console.log(c.bold(c.cyan('═'.repeat(60))));
  console.log('');

  // 总体统计
  console.log(c.bold('Overview'));
  console.log('─'.repeat(60));
  console.log(`Total Calls:  ${c.yellow(report.totalCalls.toString())}`);
  console.log(`Total Time:   ${c.yellow((report.totalTime / 1000).toFixed(2) + 's')}`);
  console.log(`Average Time: ${c.yellow(report.avgTime.toFixed(2) + 'ms')}`);
  console.log('');

  // 最常用的工具
  if (report.topTools.length > 0) {
    console.log(c.bold('Top 10 Most Used Tools'));
    console.log('─'.repeat(60));
    report.topTools.forEach((m, i) => {
      const callsStr = m.calls.toString().padStart(6);
      const avgStr = m.avgTime.toFixed(0).padStart(6);
      const successStr = (m.successRate * 100).toFixed(0).padStart(3);

      console.log(
        `${c.dim((i + 1).toString().padStart(2) + '.')} ` +
          `${m.tool.padEnd(20)} ` +
          `${c.yellow(callsStr)} calls  ` +
          `${m.avgTime > 1000 ? c.yellow(avgStr + 'ms') : c.dim(avgStr + 'ms')} avg  ` +
          `${m.successRate >= 0.9 ? c.green(successStr + '%') : m.successRate >= 0.7 ? c.yellow(successStr + '%') : c.red(successStr + '%')} success`,
      );
    });
    console.log('');
  }

  // 慢工具
  if (report.slowTools.length > 0) {
    console.log(c.bold(c.yellow('Slow Tools (>1s average)')));
    console.log('─'.repeat(60));
    report.slowTools.forEach((m, i) => {
      const avgStr = (m.avgTime / 1000).toFixed(2);
      const maxStr = (m.maxTime / 1000).toFixed(2);

      console.log(
        `${c.dim((i + 1).toString().padStart(2) + '.')} ` +
          `${m.tool.padEnd(20)} ` +
          `${c.yellow(avgStr + 's')} avg  ` +
          `${c.yellow(maxStr + 's')} max  ` +
          `${c.dim(m.calls + ' calls')}`,
      );
    });
    console.log('');
  }

  // 高错误率工具
  if (report.errorProneTools.length > 0) {
    console.log(c.bold(c.red('Error-Prone Tools (>10% error rate)')));
    console.log('─'.repeat(60));
    report.errorProneTools.forEach((m, i) => {
      const errorRateStr = (m.errorRate * 100).toFixed(1);
      const errorStr = `${m.errorCount}/${m.calls}`;

      console.log(
        `${c.dim((i + 1).toString().padStart(2) + '.')} ` +
          `${m.tool.padEnd(20)} ` +
          `${c.red(errorRateStr + '%')} errors  ` +
          `${c.dim(errorStr + ' failed')}`,
      );
    });
    console.log('');
  }

  // 提示信息
  if (report.totalCalls === 0) {
    console.log(c.dim('No tool calls recorded in this session yet.'));
    console.log(c.dim('Metrics are collected by the agent loop and reset when the process exits.'));
    console.log(c.dim('If you have already run tools and see zero here, metrics may be disabled.'));
    console.log('');
  } else {
    console.log(c.dim('Use "/metrics <tool>" to see detailed metrics for a specific tool'));
    console.log(c.dim('Use "/metrics reset" to clear all metrics'));
    console.log(c.dim('Use "/metrics export" to export metrics as JSON'));
    console.log('');
  }

  console.log(c.bold(c.cyan('═'.repeat(60))));
  console.log('');

  ctx.ui.promptUser();
  return { handled: true };
}
