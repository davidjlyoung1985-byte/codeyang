/**
 * Slash command handlers for the interactive CLI.
 * Each handler receives a CommandContext with UI, agent, and config access.
 */
import type { CliUI } from './ui/CliUI.js';
import type { Agent } from './agent/Agent.js';
import type { McpManager } from './mcp/McpManager.js';
import { config, getMcpServers, reloadConfig } from './agent/config.js';
import { saveSession, searchSessions } from './utils/sessionStore.js';
import { editHistory } from './utils/editHistory.js';
import { writeFile } from 'node:fs/promises';

export interface CommandContext {
  ui: CliUI;
  agent: Agent;
  mcpMgr: McpManager;
  currentSessionId: string | undefined;
}

type DispatchResult = { handled: boolean; exit?: boolean };

export async function dispatch(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const lower = line.toLowerCase().trim();

  if (['exit', 'quit', '/exit', '/quit'].includes(lower)) {
    await saveSession(ctx.agent.exportMessages(), ctx.currentSessionId);
    await ctx.mcpMgr.shutdown();
    ctx.ui.close();
    process.exit(0);
  }

  if (lower === '/clear') return cmdClear(ctx);
  if (lower === '/tasks') return cmdTasks(ctx);
  if (lower === '/rewind') return cmdRewind(ctx);
  if (lower === '/diff') return await cmdDiff(ctx);
  if (lower.startsWith('/commit')) return await cmdCommit(line, ctx);
  if (lower === '/branch') return await cmdBranch(ctx);
  if (lower === '/tag') return cmdTag(ctx);
  if (lower === '/ctx_viz' || lower === '/context') return cmdCtxViz(ctx);
  if (lower === '/plan') return cmdPlan(ctx);
  if (lower === '/sessions') return await cmdSessions(ctx);
  if (lower === '/tools') return await cmdTools(ctx);
  if (lower === '/stats') return cmdStats(ctx);
  if (lower.startsWith('/model')) return cmdModel(line, ctx);
  if (lower === '/config') return cmdConfig(ctx);
  if (lower === '/reload') return await cmdReload(ctx);
  if (lower === '/mcp') return cmdMcp(ctx);
  if (lower === '/undo') return await cmdUndo(ctx);
  if (lower === '/redo') return await cmdRedo(ctx);

  if (lower.startsWith('/')) {
    const validCommands = ['/clear', '/sessions', '/tasks', '/tools', '/model', '/mcp', '/stats', '/exit', '/quit'];
    if (!validCommands.includes(lower)) {
      const suggestions = validCommands.filter((v) => v.startsWith(lower) || v.includes(lower.slice(1)));
      if (suggestions.length > 0) {
        console.log(`  Did you mean: ${suggestions.join(', ')}?`);
      } else {
        console.log(`  Available: ${validCommands.join(', ')}`);
      }
      ctx.ui.promptUser();
      return { handled: true };
    }
  }

  return { handled: false };
}

// ── Individual command handlers ──────────────────────────────────────────────

function cmdClear(ctx: CommandContext): DispatchResult {
  ctx.agent.reset();
  ctx.ui.showSystemMessage('Conversation cleared. Starting fresh.');
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdTasks(ctx: CommandContext): Promise<DispatchResult> {
  const { listTasks } = await import('./utils/taskStore.js');
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

function cmdRewind(ctx: CommandContext): DispatchResult {
  const ok = ctx.agent.restoreCheckpoint();
  console.log(ok ? '  Rewound to previous checkpoint.' : '  No checkpoints available.');
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdDiff(ctx: CommandContext): Promise<DispatchResult> {
  const { executeGitDiff } = await import('./tools/GitTool.js');
  const result = await executeGitDiff(process.cwd(), false, undefined);
  console.log(`\n${result}`);
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdCommit(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const msg = line.slice(8).trim();
  if (!msg) {
    console.log('  Usage: /commit <message>');
  } else {
    const { executeGitCommit } = await import('./tools/GitTool.js');
    const result = await executeGitCommit(msg, process.cwd(), true);
    console.log(`\n${result}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdBranch(ctx: CommandContext): Promise<DispatchResult> {
  const { executeGitBranch } = await import('./tools/GitTool.js');
  const result = await executeGitBranch(process.cwd(), false);
  console.log(`\n${result}`);
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdTag(ctx: CommandContext): DispatchResult {
  const idx = ctx.agent.saveCheckpoint();
  console.log(`  Checkpoint ${idx} saved. Use /rewind to return here.`);
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdCtxViz(ctx: CommandContext): DispatchResult {
  const usage = ctx.agent.getTokenUsage();
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const maxTokens = config.maxTokens;
  const pct = Math.round((totalTokens / maxTokens) * 100);
  const barLen = 30;
  const filled = Math.round((pct / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLen - filled));
  console.log(`  Context: ${bar} ${pct}%`);
  console.log(`  Used: ${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`);
  console.log(`  Messages in history: ${ctx.agent.exportMessages().length}`);
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdPlan(ctx: CommandContext): Promise<DispatchResult> {
  const { isPlanMode, setPlanMode } = await import('./tools/registry.js');
  if (isPlanMode()) {
    setPlanMode(false);
    console.log('  Planning mode deactivated.');
  } else {
    console.log('  Enter planning mode: the agent will plan before executing.');
    console.log('  Use EnterPlanMode tool in conversation, or /plan again to exit.');
  }
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdSessions(ctx: CommandContext): Promise<DispatchResult> {
  const sessions = await searchSessions();
  if (sessions.length === 0) {
    console.log('No saved sessions.');
  } else {
    for (const s of sessions) {
      const msgInfo = s.messageCount ? ` ${s.messageCount}msgs` : '';
      console.log(`  ${s.id.slice(0, 12)}  ${s.title.slice(0, 50).padEnd(50)}  ${s.updatedAt.slice(0, 10)}${msgInfo}`);
    }
  }
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdTools(ctx: CommandContext): Promise<DispatchResult> {
  const { toolSchemas } = await import('./tools/registry.js');
  const schemas = toolSchemas();
  console.log(`\n  Available tools (${schemas.length}):`);
  for (const t of schemas) {
    console.log(`  · ${t.name.padEnd(18)} ${t.description.split('.')[0]}`);
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdStats(ctx: CommandContext): DispatchResult {
  const stats = ctx.agent.getToolStats();
  const entries = Object.entries(stats).sort((a, b) => b[1].calls - a[1].calls);
  if (!entries.length) {
    console.log('\n  No tools used yet.\n');
  } else {
    console.log(`\n  Tool Usage (${entries.length} tools):`);
    console.log(`  ${'Tool'.padEnd(20)} ${'Calls'.padEnd(6)} ${'Avg ms'.padEnd(8)} ${'Errors'}`);
    console.log(`  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(6)}`);
    for (const [n, s] of entries) {
      const avg = s.calls > 0 ? Math.round(s.totalMs / s.calls) : 0;
      console.log(
        `  ${n.padEnd(20)} ${String(s.calls).padEnd(6)} ${String(avg).padEnd(8)} ${String(s.errors).padEnd(6)}`,
      );
    }
    console.log('');
  }
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdModel(line: string, ctx: CommandContext): DispatchResult {
  const arg = line.slice(6).trim();
  if (arg) {
    config.model = arg;
    ctx.ui.showSystemMessage(`Model switched to: ${arg}`);
  } else {
    console.log(`  Model: ${config.model}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdConfig(ctx: CommandContext): DispatchResult {
  console.log(`\n  Provider:     ${config.provider}`);
  console.log(`  Model:        ${config.model}`);
  console.log(`  Base URL:     ${config.baseURL}`);
  console.log(`  Max Tokens:   ${config.maxTokens}`);
  console.log(`  Max Turns:    ${config.maxTurns}`);
  console.log(`  API Key:      ${config.apiKey ? '********' : '(not set)'}`);
  console.log(`  CWD:          ${process.cwd()}`);
  const servers = getMcpServers();
  if (Object.keys(servers).length > 0) {
    console.log(`  MCP Servers:  ${Object.keys(servers).join(', ')}`);
  }
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdReload(ctx: CommandContext): Promise<DispatchResult> {
  try {
    await reloadConfig();
    console.log('  Configuration reloaded from ~/.codeyang/config.json');
  } catch (err) {
    console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

function cmdMcp(ctx: CommandContext): DispatchResult {
  if (!ctx.mcpMgr.hasServers) {
    console.log('No MCP servers configured.');
    console.log('\nAdd servers to ~/.codeyang/config.json:');
    console.log(
      '{\n  "mcpServers": {\n    "my-server": {\n      "command": "node",\n      "args": ["server.js"]\n    }\n  }\n}',
    );
  } else {
    const names = ctx.mcpMgr.serverNames;
    console.log(`MCP Servers (${names.length}):`);
    for (const name of names) {
      const status = ctx.mcpMgr.getServerStatus(name);
      console.log(`  ${status === 'connected' ? '(+)' : '(!)'} ${name}: ${status}`);
    }
  }
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdUndo(ctx: CommandContext): Promise<DispatchResult> {
  const entry = editHistory.undo();
  if (!entry) {
    console.log('  Nothing to undo.');
  } else {
    await writeFile(entry.filePath, entry.previousContent, 'utf-8');
    console.log(`  Undone edit to ${entry.filePath}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

async function cmdRedo(ctx: CommandContext): Promise<DispatchResult> {
  const entry = editHistory.redo();
  if (!entry) {
    console.log('  Nothing to redo.');
  } else {
    await writeFile(entry.filePath, entry.previousContent, 'utf-8');
    console.log(`  Redone edit to ${entry.filePath}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}
