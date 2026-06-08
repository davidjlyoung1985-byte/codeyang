#!/usr/bin/env node
import * as readline from 'node:readline';
import { CliUI } from './ui/CliUI.js';
import { VERSION } from './version.js';
import { Agent } from './agent/Agent.js';
import { config, loadLocalConfig, setSessionApiKey, getMcpServers } from './agent/config.js';
import { saveSession, listSessions, loadSession, deleteSession, searchSessions } from './utils/sessionStore.js';
import { setMcpManager, refreshMcpTools, registerQtTools } from './tools/registry.js';
import { McpManager } from './mcp/McpManager.js';
import { detectQtProject, createQtTools } from './qt/index.js';
import { loadEnvFiles } from './utils/dotenv.js';

async function promptForDeepSeekKey(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter your DeepSeek API key: ', (key) => {
      rl.close();
      resolve(key.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-V')) {
    console.log(`CodeYang v${VERSION}`);
    process.exit(0);
  }

  if (args.includes('--list') || args.includes('-l')) {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.log('No saved sessions.');
      process.exit(0);
    }
    for (const s of sessions) {
      console.log(`${s.id}  ${s.title}  (${s.updatedAt})`);
    }
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`CodeYang v${VERSION} - AI Coding Agent
Usage: codeyang [options]

Options:
  --help, -h       Show this help message
  --version, -V    Show version number
  --list, -l       List saved sessions
  --resume <id>    Resume a saved session
  --delete <id>    Delete a saved session
  --non-interactive
  --quiet          Use configured API key without prompt (fails if unset)

Interactive Commands:
  /clear           Reset the conversation
  /sessions        List saved sessions
  /sessions --search <keyword>  Search saved sessions
  /tools           List all available tools
  /model           Show current model
  /model <name>    Switch model
  /mcp             Show MCP server status
  /stats           Show token usage for this session
  /exit, /quit     Exit CodeYang`);
    process.exit(0);
  }

  const deleteIdx = args.indexOf('--delete');
  if (deleteIdx !== -1 && args[deleteIdx + 1]) {
    const sessionId = args[deleteIdx + 1];
    const deleted = await deleteSession(sessionId);
    if (deleted) {
      console.log(`Session ${sessionId} deleted.`);
    } else {
      console.log(`Session ${sessionId} not found.`);
    }
    process.exit(0);
  }

  // Load .env / .env.local before anything else
  loadEnvFiles();

  await loadLocalConfig();

  // Skip API key prompt if already configured via env var or config file
  const existingKey = config.apiKey;
  if (existingKey) {
    setSessionApiKey(existingKey);
    console.log(`  Using saved API key (${existingKey.slice(0, 8)}...)\n`);
  } else {
    if (args.includes('--non-interactive') || args.includes('--quiet')) {
      console.error('No API key configured. Set CODEYANG_API_KEY or DEEPSEEK_API_KEY environment variable.');
      process.exit(1);
    }
    const key = await promptForDeepSeekKey();
    if (!key) {
      console.log('No API key provided. Exiting.');
      process.exit(1);
    }
    setSessionApiKey(key);
  }

  // Initialize MCP servers if configured
  const mcpMgr = new McpManager();
  const mcpServers = getMcpServers();
  if (Object.keys(mcpServers).length > 0) {
    const entries = Object.entries(mcpServers);
    console.log(`Starting ${entries.length} MCP server(s)...`);
    mcpMgr.configure(mcpServers);
    await mcpMgr.initialize((name, status, detail) => {
      const icon = status === 'connected' ? '+' : status === 'error' ? '!' : '>';
      console.log(`  ${icon} ${name}: ${detail}`);
    });
    setMcpManager(mcpMgr);
    await refreshMcpTools();
    const totalTools = mcpMgr.allTools.length;
    if (totalTools > 0) {
      console.log(`  MCP tools available: ${totalTools}\n`);
    }
  } else {
    setMcpManager(null);
  }

  // Detect Qt project and inject Qt-specific knowledge/tools
  const qtContext = await detectQtProject(process.cwd());
  if (qtContext.isQtProject) {
    registerQtTools(createQtTools(qtContext));
  }

  const ui = new CliUI();
  const agent = new Agent(qtContext);
  let running = false;
  let sigintCount = 0;
  let currentSessionId: string | undefined;

  const resumeIdx = args.indexOf('--resume');
  if (resumeIdx !== -1 && args[resumeIdx + 1]) {
    const sessionId = args[resumeIdx + 1];
    const session = await loadSession(sessionId);
    if (session) {
      agent.loadMessages(session.messages);
      currentSessionId = session.id;
      console.log(`\nResumed session: ${session.title}\n`);
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
    running = false;
    ui.showAgentDone();
    ui.promptUser();
  }

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

    if (lower === '/sessions') {
      const sessions = await listSessions();
      if (sessions.length === 0) {
        console.log('No saved sessions.');
      } else {
        console.log(`  ${sessions.length} session(s):`);
        for (const s of sessions) console.log(`  ${s.id}  ${s.title}  (${s.updatedAt})`);
      }
      ui.promptUser();
      return;
    }

    if (lower.startsWith('/sessions --search ')) {
      const keyword = line.slice(18).trim();
      if (!keyword) {
        console.log('  Usage: /sessions --search <keyword>');
      } else {
        const results = await searchSessions(keyword);
        if (results.length === 0) {
          console.log(`  No sessions found matching "${keyword}".`);
        } else {
          console.log(`  ${results.length} session(s) matching "${keyword}":`);
          for (const r of results) console.log(`  ${r.id}  ${r.title}  (${r.matchCount} match(es))`);
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

    if (lower === '/stats') {
      const usage = agent.getTokenUsage();
      const total = usage.inputTokens + usage.outputTokens;
      console.log(`  Token usage this session:`);
      console.log(`    Input:  ${usage.inputTokens.toLocaleString()}`);
      console.log(`    Output: ${usage.outputTokens.toLocaleString()}`);
      console.log(`    Total:  ${total.toLocaleString()}`);
      console.log(`    Model:  ${config.model}`);
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

    if (agent.waitingForAnswer) {
      agent.answerQuestion(line);
      return;
    }

    await handleInput(line);
  });

  const sigintHandler = async () => {
    sigintCount++;
    if (sigintCount > 1) {
      process.exit(1);
    }

    console.log('\n\nSaving session before exit... (Ctrl+C again to force quit)');

    try {
      // Cancel any pending question so the agent can exit cleanly
      agent.cancelQuestion();

      if (running) {
        await saveSession(agent.exportMessages(), currentSessionId);
        console.log('Session saved.');
      }
      await mcpMgr.shutdown();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigintHandler);

  ui.welcome();
  ui.promptUser();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});


