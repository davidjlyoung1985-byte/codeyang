/**
 * Information and listing commands: /sessions, /tools, /stats, /tasks, /status
 */
import type { CommandContext, DispatchResult } from './types.js';
import picocolors from 'picocolors';

const c = picocolors;

export async function cmdSessions(ctx: CommandContext): Promise<DispatchResult> {
  const { listSessionsByProject } = await import('../utils/sessionStore.js');
  const groups = await listSessionsByProject();

  const projectNames = Object.keys(groups);
  if (projectNames.length === 0 || projectNames.every((p) => groups[p].length === 0)) {
    console.log('No saved sessions.');
    ctx.ui.promptUser();
    return { handled: true };
  }

  // Sort: current project first, then alphabetical
  const currentProject = projectNames.includes('other') ? 'other' : projectNames[0];
  const sortedProjects = projectNames.sort((a, b) => {
    if (a === currentProject) return -1;
    if (b === currentProject) return 1;
    return a.localeCompare(b);
  });

  for (const project of sortedProjects) {
    const sessions = groups[project];
    if (sessions.length === 0) continue;
    const isCurrent = project === currentProject;
    console.log(`\n  ${isCurrent ? c.bold(c.green('📁 ' + project)) : c.dim('📁 ' + project)} (${sessions.length})`);
    for (const s of sessions.slice(0, 10)) {
      const msgInfo = s.messageCount ? ` ${s.messageCount}msgs` : '';
      const title = s.title
        .replace(/^\[.*?\]\s*/, '')
        .slice(0, 40)
        .padEnd(40);
      console.log(`    ${c.dim(s.id.slice(0, 12))}  ${title}  ${c.dim(s.updatedAt.slice(0, 10))}${msgInfo}`);
    }
    if (sessions.length > 10) {
      console.log(`    ${c.dim(`... and ${sessions.length - 10} more`)}`);
    }
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdTools(ctx: CommandContext): Promise<DispatchResult> {
  const { toolSchemas } = await import('../tools/registry.js');
  const schemas = toolSchemas();
  console.log(`\n  Available tools (${schemas.length}):`);
  for (const t of schemas) {
    const desc = typeof t.description === 'string' ? t.description : '';
    console.log(`  · ${t.name.padEnd(18)} ${desc.split('.')[0]}`);
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

export function cmdStats(ctx: CommandContext): DispatchResult {
  const msgs = ctx.agent.exportMessages();
  const usage = ctx.agent.getTokenUsage();
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const toolUses = msgs.filter((m) => {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      return m.content.some((c: { type: string }) => c.type === 'tool_use');
    }
    return false;
  }).length;
  const userMsgs = msgs.filter((m) => m.role === 'user').length;
  const assistantMsgs = msgs.filter((m) => m.role === 'assistant').length;

  console.log('\n  Session Stats:');
  console.log(`  Messages: ${msgs.length} (${userMsgs} user, ${assistantMsgs} assistant)`);
  console.log(`  Tool uses: ${toolUses}`);
  console.log(
    `  Tokens: ${totalTokens.toLocaleString()} (in: ${usage.inputTokens.toLocaleString()}, out: ${usage.outputTokens.toLocaleString()})`,
  );
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdTasks(ctx: CommandContext): Promise<DispatchResult> {
  const { listTasks } = await import('../utils/taskStore.js');
  const tasks = await listTasks();
  if (tasks.length === 0) {
    console.log('No tasks. Create one with TaskCreate tool.');
  } else {
    console.log(`  ${tasks.length} task(s):`);
    for (const t of tasks) {
      const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '►' : '○';
      console.log(`  ${icon} ${t.id.slice(0, 16)}  ${t.title.slice(0, 60)}  [${t.status}]`);
    }
  }
  ctx.ui.promptUser();
  return { handled: true };
}

export function cmdStatus(ctx: CommandContext): DispatchResult {
  const msgs = ctx.agent.exportMessages();
  const usage = ctx.agent.getTokenUsage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentConfig = (ctx.agent as any).config || {};
  console.log('\n  Agent Status:');
  console.log(`  Messages: ${msgs.length}`);
  console.log(`  Tokens: ${(usage.inputTokens + usage.outputTokens).toLocaleString()}`);
  console.log(`  Model: ${agentConfig.model || 'unknown'}`);
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}
