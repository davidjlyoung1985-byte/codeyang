#!/usr/bin/env node
import 'dotenv/config';
import * as readline from 'node:readline';
import { CliUI } from './ui/CliUI.js';
import { Agent } from './agent/Agent.js';
import { editHistory } from './utils/editHistory.js';
import { writeFile } from 'node:fs/promises';
import {
  config,
  loadLocalConfig,
  setSessionApiKey,
  getMcpServers,
  saveApiSettings,
  validateConfig,
} from './agent/config.js';
import {
  saveSession,
  listSessions,
  loadSession,
  deleteSession,
  searchSessions,
  exportSessionAsMarkdown,
  exportSessionAsJson,
  importSessionFromFile,
} from './utils/sessionStore.js';
import { logger } from './utils/logger.js';
import { setMcpManager, refreshMcpTools, registerQtTools } from './tools/registry.js';
import { McpManager } from './mcp/McpManager.js';
import { detectQtProject, createQtTools } from './qt/index.js';
import { dispatch as dispatchCommand, type CommandContext } from './commands.js';
import { VERSION } from './version.js';
import { checkNodeVersion } from './utils/nodeVersionCheck.js';

async function promptForApiKey(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter your API key: ', (key) => {
      rl.close();
      resolve(key.trim());
    });
  });
}

/** Confirm boolean from stdin */
async function confirmSave(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Save this key to config for future sessions? (y/N): ', (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes');
    });
  });
}

async function resolveApiKey(): Promise<string> {
  // Priority: CLI arg > env var > saved config > prompt
  const args = process.argv.slice(2);
  const argIdx = args.indexOf('--api-key');
  if (argIdx !== -1 && args[argIdx + 1]) {
    return args[argIdx + 1];
  }

  const fromEnv = config.apiKey;
  if (fromEnv) return fromEnv;

  const key = await promptForApiKey();
  if (!key) {
    logger.error('No API key provided. Exiting.');
    process.exit(1);
  }

  const shouldSave = await confirmSave();
  if (shouldSave) {
    await saveApiSettings({ apiKey: key });
    logger.info('API key saved to ~/.codeyang/config.json');
  }

  return key;
}

async function main() {
  checkNodeVersion();

  // ── Global error handlers ────────────────────────────────────
  process.on('unhandledRejection', (reason) => {
    console.error('\n⚠️ Unhandled rejection:', reason instanceof Error ? reason.message : String(reason));
  });

  process.on('uncaughtException', (err) => {
    console.error('\n❌ Uncaught exception:', err.message);
    console.error(err.stack);
    process.exit(1);
  });

  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-V')) {
    console.log(`CodeYang v${VERSION}`);
    process.exit(0);
  }

  if (args.includes('--list') || args.includes('-l')) {
    const listIdx = args.includes('--list') ? args.indexOf('--list') : args.indexOf('-l');
    const nextArg = listIdx >= 0 && listIdx < args.length - 1 ? args[listIdx + 1] : undefined;
    const searchQuery = nextArg && !nextArg.startsWith('-') ? nextArg : undefined;
    const sessions = searchQuery
      ? await searchSessions(searchQuery)
      : (await listSessions()).map((s) => ({ ...s, messageCount: 0 }));

    if (sessions.length === 0) {
      console.log(searchQuery ? `No sessions matching "${searchQuery}".` : 'No saved sessions.');
      process.exit(0);
    }
    for (const s of sessions) {
      const msgInfo = s.messageCount ? ` ${s.messageCount}msgs` : '';
      console.log(`${s.id.slice(0, 12)}  ${s.title.slice(0, 50).padEnd(50)}  ${s.updatedAt.slice(0, 10)}${msgInfo}`);
    }
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`CodeYang v${VERSION} - AI Coding Agent
Usage: codeyang [options]

Options:
  --help, -h          Show this help message
  --version, -V       Show version number
  --list, -l [query]  List saved sessions (optionally filter by title)
  --resume <id>       Resume a saved session
  --delete <id>       Delete a saved session
  --api-key <key>     Set API key directly (overrides env/config)
  --export <id>       Export a session as Markdown to stdout
  --export-md <id>    Export a session as Markdown to a file (session-<id>.md)
  --export-json <id>  Export a session as JSON to a file (session-<id>.json)
  --import <file>     Import a session from a JSON file

Environment Variables:
  CODEYANG_API_KEY          API key for the LLM provider
  CODEYANG_MODEL            Model name (default: deepseek-chat)
  CODEYANG_BASE_URL         Custom API base URL
  CODEYANG_MAX_TOKENS       Max tokens per response (default: 8192)
  DEEPSEEK_API_KEY          Alternative env var for API key

Interactive Commands:
  /clear           Reset the conversation
  /sessions        List saved sessions
  /tasks           List tasks
  /tasks --search <keyword>  Search tasks
  /tools           List all available tools
  /stats           Show tool usage statistics for this session
  /model           Show current model
  /model <name>    Switch model
  /mcp             Show MCP server status
  /config          Show current configuration
  /undo            Undo the last file edit
  /redo            Redo the last undone file edit
  /reload          Reload configuration from ~/.codeyang/config.json
  /exit, /quit     Exit CodeYang

API Key priority: --api-key arg > CODEYANG_API_KEY > saved config > prompt
Keys entered interactively can be saved to ~/.codeyang/config.json`);
    process.exit(0);
  }

  const deleteIdx = args.indexOf('--delete');
  if (deleteIdx !== -1 && args[deleteIdx + 1]) {
    const sessionId = args[deleteIdx + 1];
    const deleted = await deleteSession(sessionId);
    if (deleted) {
      logger.info(`Session ${sessionId} deleted.`);
    } else {
      logger.info(`Session ${sessionId} not found.`);
    }
    process.exit(0);
  }

  // ── Export / Import ────────────────────────────────────────

  const exportIdx = args.indexOf('--export');
  if (exportIdx !== -1 && args[exportIdx + 1]) {
    const sessionId = args[exportIdx + 1];
    try {
      const md = await exportSessionAsMarkdown(sessionId);
      console.log(md);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  }

  const exportMdIdx = args.indexOf('--export-md');
  if (exportMdIdx !== -1 && args[exportMdIdx + 1]) {
    const sessionId = args[exportMdIdx + 1];
    try {
      const md = await exportSessionAsMarkdown(sessionId);
      const outPath = `session-${sessionId}.md`;
      await import('node:fs/promises').then((fs) => fs.writeFile(outPath, md, 'utf-8'));
      console.log(`Session exported to ${outPath}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  }

  const exportJsonIdx = args.indexOf('--export-json');
  if (exportJsonIdx !== -1 && args[exportJsonIdx + 1]) {
    const sessionId = args[exportJsonIdx + 1];
    try {
      const session = await exportSessionAsJson(sessionId);
      const outPath = `session-${sessionId}.json`;
      await import('node:fs/promises').then((fs) => fs.writeFile(outPath, JSON.stringify(session, null, 2), 'utf-8'));
      console.log(`Session exported to ${outPath}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  }

  const importIdx = args.indexOf('--import');
  if (importIdx !== -1 && args[importIdx + 1]) {
    const filePath = args[importIdx + 1];
    try {
      const id = await importSessionFromFile(filePath);
      console.log(`Session imported: ${id}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  }

  await loadLocalConfig();

  const configErrors = validateConfig();
  if (configErrors.length > 0) {
    console.log(`  Configuration warnings:`);
    for (const e of configErrors) {
      console.log(`    ! ${e.field}: ${e.message}`);
    }
  }

  const key = await resolveApiKey();
  setSessionApiKey(key);

  // Initialize MCP servers if configured
  const mcpMgr = new McpManager();
  const mcpServers = getMcpServers();
  if (Object.keys(mcpServers).length > 0) {
    const entries = Object.entries(mcpServers);
    logger.info(`Starting ${entries.length} MCP server(s)...`);
    mcpMgr.configure(mcpServers);
    await mcpMgr.initialize((name, status, detail) => {
      const icon = status === 'connected' ? '+' : status === 'error' ? '!' : '>';
      console.log(`  ${icon} ${name}: ${detail}`);
    });
    setMcpManager(mcpMgr);
    await refreshMcpTools();
    const totalTools = mcpMgr.allTools.length;
    if (totalTools > 0) {
      logger.info(`  MCP tools available: ${totalTools}\n`);
    }
  } else {
    setMcpManager(null);
  }

  async function cleanup() {
    try {
      await mcpMgr.shutdown();
    } catch {
      // Ignore shutdown errors
    }
  }

  // Detect Qt project and inject Qt-specific knowledge/tools
  const qtContext = await detectQtProject(process.cwd());
  if (qtContext.isQtProject) {
    registerQtTools(createQtTools(qtContext));
  }

  const ui = new CliUI();
  const agent = new Agent(qtContext);
  let running = false;
  let currentSessionId: string | undefined;

  const resumeIdx = args.indexOf('--resume');
  if (resumeIdx !== -1 && args[resumeIdx + 1]) {
    const sessionId = args[resumeIdx + 1];
    const session = await loadSession(sessionId);
    if (session) {
      agent.loadMessages(session.messages);
      currentSessionId = session.id;
      logger.info(`\nResumed session: ${session.title}\n`);
    } else {
      console.log(`\nSession not found: ${sessionId}\n`);
    }
  }

  agent.setCallbacks({
    onAgentText(text) {
      ui.showAgentText(text);
    },
    onAgentDelta(text) {
      ui.showAgentDelta(text);
    },
    onToolBatch(total) {
      ui.setToolProgressTotal(total);
    },
    onToolStart(name, args) {
      ui.showToolCall(name, args);
    },
    onToolResult(_name, output, isError) {
      ui.showToolResult(output, isError);
    },
    onQuestion(q, options) {
      ui.showQuestion(q, options);
    },
    onError(err) {
      ui.showError(err);
    },
  });

  async function handleInput(line: string) {
    if (running) return;
    running = true;

    try {
      ui.showUserMessage(line);
      ui.showAgentStart();
      // Show progress bar during thinking
      ui.startSpinner('thinking');

      try {
        await agent.run(line);
        currentSessionId = await saveSession(agent.exportMessages(), currentSessionId);
      } catch (err) {
        ui.showError(err instanceof Error ? err.message : String(err));
      }

      ui.stopSpinner();
      ui.showAgentDone();
      ui.promptUser();
    } finally {
      running = false;
    }
  }

  const cmdCtx: CommandContext = { ui, agent, mcpMgr, currentSessionId };

  ui.setInputHandler(async (line) => {
    const lower = line.toLowerCase().trim();

    if (['exit', 'quit', '/exit', '/quit'].includes(lower)) {
      await saveSession(agent.exportMessages(), currentSessionId);
      await mcpMgr.shutdown();
      ui.close();
      process.exit(0);
    }

    if (lower === '/clear') {
      agent.reset();
      ui.showSystemMessage('Conversation cleared. Starting fresh.');
      ui.promptUser();
      return;
    }

    if (lower === '/tasks') {
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
      ui.promptUser();
      return;
    }

    if (lower === '/rewind') {
      const ok = agent.restoreCheckpoint();
      if (ok) {
        console.log('  Rewound to previous checkpoint.');
      } else {
        console.log('  No checkpoints available.');
      }
      ui.promptUser();
      return;
    }

    if (lower === '/diff') {
      const { executeGitDiff } = await import('./tools/GitTool.js');
      const result = await executeGitDiff(process.cwd(), line.includes('--staged'), undefined);
      console.log(`\n${result}`);
      ui.promptUser();
      return;
    }

    if (lower.startsWith('/commit')) {
      const msg = line.slice(8).trim();
      if (!msg) {
        console.log('  Usage: /commit <message>');
      } else {
        const { executeGitCommit } = await import('./tools/GitTool.js');
        const result = await executeGitCommit(msg, process.cwd(), true);
        console.log(`\n${result}`);
      }
      ui.promptUser();
      return;
    }

    if (lower === '/branch') {
      const { executeGitBranch } = await import('./tools/GitTool.js');
      const result = await executeGitBranch(process.cwd(), false);
      console.log(`\n${result}`);
      ui.promptUser();
      return;
    }

    if (lower === '/tag') {
      const idx = agent.saveCheckpoint();
      console.log(`  Checkpoint ${idx} saved. Use /rewind to return here.`);
      ui.promptUser();
      return;
    }

    if (lower === '/matlab') {
      const { saveMcpServers, getMcpServers } = await import('./agent/config.js');
      const servers = getMcpServers();
      if (servers['matlab']) {
        console.log('  MATLAB MCP server is already configured.');
        console.log('  Restart CodeYang to apply.');
      } else {
        servers['matlab'] = {
          command: 'npx',
          args: ['tsx', 'mcp-servers/matlab/server.ts'],
        };
        await saveMcpServers(servers);
        console.log('  ✅ MATLAB MCP server configured.');
        console.log('  Restart CodeYang to connect.');
      }
      ui.promptUser();
      return;
    }

    if (lower === '/ctx_viz' || lower === '/context') {
      const usage = agent.getTokenUsage();
      const totalTokens = usage.inputTokens + usage.outputTokens;
      const maxTokens = config.maxTokens;
      const pct = Math.round((totalTokens / maxTokens) * 100);
      const barLen = 30;
      const filled = Math.round((pct / 100) * barLen);
      const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLen - filled));
      console.log(`  Context: ${bar} ${pct}%`);
      console.log(`  Used: ${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`);
      console.log(`  Messages in history: ${agent.exportMessages().length}`);
      ui.promptUser();
      return;
    }

    if (lower === '/plan') {
      const { isPlanMode, setPlanMode } = await import('./tools/registry.js');
      if (isPlanMode()) {
        setPlanMode(false);
        console.log('  Planning mode deactivated.');
      } else {
        console.log('  Enter planning mode: the agent will plan before executing.');
        console.log('  Use EnterPlanMode tool in conversation, or /plan again to exit.');
      }
      ui.promptUser();
      return;
    }

    if (lower === '/sessions') {
      const sessions = await searchSessions();
      if (sessions.length === 0) {
        console.log('No saved sessions.');
      } else {
        for (const s of sessions) {
          const msgInfo = s.messageCount ? ` ${s.messageCount}msgs` : '';
          console.log(
            `  ${s.id.slice(0, 12)}  ${s.title.slice(0, 50).padEnd(50)}  ${s.updatedAt.slice(0, 10)}${msgInfo}`,
          );
        }
      }
      ui.promptUser();
      return;
    }

    if (lower === '/tools') {
      const { toolSchemas } = await import('./tools/registry.js');
      const schemas = toolSchemas();
      console.log(`\n  Available tools (${schemas.length}):`);
      for (const t of schemas) {
        console.log(`  · ${t.name.padEnd(18)} ${t.description.split('.')[0]}`);
      }
      console.log('');
      ui.promptUser();
      return;
    }

    if (lower === '/stats') {
      const stats = agent.getToolStats();
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
      ui.promptUser();
      return;
    }

    if (lower.startsWith('/model')) {
      const arg = line.slice(6).trim();
      if (arg) {
        config.model = arg;
        ui.showSystemMessage(`Model switched to: ${arg}`);
      } else {
        console.log(`  Model: ${config.model}`);
      }
      ui.promptUser();
      return;
    }

    if (lower === '/config') {
      console.log(`\n  Provider:     ${config.provider}`);
      console.log(`  Model:        ${config.model}`);
      console.log(`  Base URL:     ${config.baseURL}`);
      console.log(`  Max Tokens:   ${config.maxTokens}`);
      console.log(`  Max Turns:    ${config.maxTurns}`);
      console.log(`  API Key:      ${config.apiKey ? '********' : '(not set)'}`);
      console.log(`  CWD:          ${process.cwd()}`);
      const mcpServers = getMcpServers();
      if (Object.keys(mcpServers).length > 0) {
        console.log(`  MCP Servers:  ${Object.keys(mcpServers).join(', ')}`);
      }
      console.log('');
      ui.promptUser();
      return;
    }

    if (lower === '/reload') {
      try {
        const { reloadConfig } = await import('./agent/config.js');
        await reloadConfig();
        console.log('  Configuration reloaded from ~/.codeyang/config.json');
      } catch (err) {
        console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
      }
      ui.promptUser();
      return;
    }

    if (lower === '/mcp') {
      if (!mcpMgr.hasServers) {
        console.log('No MCP servers configured.');
        console.log('\nAdd servers to ~/.codeyang/config.json:');
        console.log(
          '{\n  "mcpServers": {\n    "my-server": {\n      "command": "node",\n      "args": ["server.js"]\n    }\n  }\n}',
        );
      } else {
        const names = mcpMgr.serverNames;
        console.log(`MCP Servers (${names.length}):`);
        for (const name of names) {
          const status = mcpMgr.getServerStatus(name);
          const icon = status === 'connected' ? '(+)' : '(!)';
          console.log(`  ${icon} ${name}: ${status}`);
        }
      }
      ui.promptUser();
      return;
    }

    if (lower === '/undo') {
      const entry = editHistory.undo();
      if (!entry) {
        console.log('  Nothing to undo.');
      } else {
        await writeFile(entry.filePath, entry.previousContent, 'utf-8');
        console.log(`  Undone edit to ${entry.filePath}`);
      }
      ui.promptUser();
      return;
    }

    if (lower === '/redo') {
      const entry = editHistory.redo();
      if (!entry) {
        console.log('  Nothing to redo.');
      } else {
        await writeFile(entry.filePath, entry.previousContent, 'utf-8');
        console.log(`  Redone edit to ${entry.filePath}`);
      }
      ui.promptUser();
      return;
    }

    // Command suggestion for unknown /commands
    if (lower.startsWith('/')) {
      const validCommands = [
        '/clear',
        '/sessions',
        '/tasks',
        '/tools',
        '/model',
        '/mcp',
        '/stats',
        '/matlab',
        '/exit',
        '/quit',
      ];
      if (!validCommands.includes(lower)) {
        const suggestions = validCommands.filter((v) => v.startsWith(lower) || v.includes(lower.slice(1)));
        if (suggestions.length > 0) {
          console.log(`  Did you mean: ${suggestions.join(', ')}?`);
        } else {
          console.log(`  Available: ${validCommands.join(', ')}`);
        }
        ui.promptUser();
        return;
      }
    }

    // Handle non-command input (agent prompts, question answers)
    if (agent.waitingForAnswer) {
      agent.answerQuestion(line);
      return;
    }

    await handleInput(line);
  });

  let shuttingDown = false;

  const sigintHandler = async () => {
    if (shuttingDown) {
      console.log('\nForce quitting...');
      process.exit(1);
    }

    // If the agent is running tool executions, cancel them but stay alive
    if (running && agent.cancelRunningTools) {
      agent.cancelRunningTools();
      // Also cancel any pending question so the agent can recover cleanly
      agent.cancelQuestion();
      console.log('\n  Tool execution cancelled. The agent will continue.');
      // Don't set shuttingDown — the user can still interact
      return;
    }

    shuttingDown = true;

    console.log('\n\nSaving session before exit... (Ctrl+C again to force quit)');

    try {
      // Cancel any pending question so the agent can exit cleanly
      agent.cancelQuestion();

      if (running) {
        await saveSession(agent.exportMessages(), currentSessionId);
        console.log('Session saved.');
      }
      await cleanup();
    } catch {
      // Best-effort shutdown
    }
    process.exit(0);
  };
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigintHandler);

  ui.welcome();
  ui.promptUser();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
