#!/usr/bin/env node
import * as readline from 'node:readline';
import { CliUI } from './ui/CliUI.js';
import { Agent } from './agent/Agent.js';
import { config, loadLocalConfig, saveApiKey, getMcpServers } from './agent/config.js';
import { saveSession, listSessions, loadSession, deleteSession } from './utils/sessionStore.js';
import { setMcpManager, refreshMcpTools } from './tools/registry.js';
import { McpManager } from './mcp/McpManager.js';

const VERSION = '0.2.0';

async function promptForApiKey(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter your Anthropic API key: ', (key) => {
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
    console.log(`CodeYang v${VERSION} — AI Coding Agent
Usage: codeyang [options]

Options:
  --help, -h       Show this help message
  --version, -V    Show version number
  --list, -l       List saved sessions
  --resume <id>    Resume a saved session
  --delete <id>    Delete a saved session

Interactive Commands:
  /clear           Reset the conversation
  /mcp             Show MCP server status
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

  await loadLocalConfig();

  if (!config.apiKey) {
    console.log('No API key found. Please enter your Anthropic API key.\n');
    const key = await promptForApiKey();
    if (!key) {
      console.log('No API key provided. Exiting.');
      process.exit(1);
    }
    await saveApiKey(key);
    console.log('API key saved to ~/.codeyang/config.json\n');
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

  const ui = new CliUI();
  const agent = new Agent();
  let running = false;
  let sigintCount = 0;

  const resumeIdx = args.indexOf('--resume');
  if (resumeIdx !== -1 && args[resumeIdx + 1]) {
    const sessionId = args[resumeIdx + 1];
    const session = await loadSession(sessionId);
    if (session) {
      agent.loadMessages(session.messages);
      console.log(`\nResumed session: ${session.title}\n`);
    } else {
      console.log(`\nSession not found: ${sessionId}\n`);
    }
  }

  agent.setCallbacks({
    onAgentText(text) {
      ui.showAgentText(text);
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
    // Show spinner during thinking
    ui.startSpinner();

    try {
      await agent.run(line);
      await saveSession(agent.exportMessages());
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
      await saveSession(agent.exportMessages());
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
        await saveSession(agent.exportMessages());
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
