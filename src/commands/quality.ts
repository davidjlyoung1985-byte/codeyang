/**
 * Code quality commands: /review, /fix
 */
import type { CommandContext, DispatchResult } from './types.js';

export async function cmdReview(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const file = line.slice(8).trim() || '.';
  ctx.ui.showSystemMessage(`Reviewing: ${file} ...`);
  ctx.ui.promptUser();
  ctx.agent
    .run(`请 code review 以下内容：${file}。重点关注：类型安全、潜在 bug、性能问题、代码规范。指出问题并给出修复建议。`)
    .catch((err) => ctx.ui.showError(err instanceof Error ? err.message : String(err)));
  return { handled: true };
}

export async function cmdFix(ctx: CommandContext): Promise<DispatchResult> {
  ctx.ui.showSystemMessage('Analyzing project for lint/type errors...');
  ctx.ui.promptUser();
  ctx.agent
    .run(
      '分析当前项目的 lint 错误和类型错误。先运行 lint 和 type-check 查看错误列表，然后逐个修复。修复后再次验证确保全部通过。',
    )
    .catch((err) => ctx.ui.showError(err instanceof Error ? err.message : String(err)));
  return { handled: true };
}
