#!/usr/bin/env node
import * as readline from 'node:readline';
import { CliUI } from './ui/CliUI.js';
import { Agent } from './agent/Agent.js';
import { config, loadLocalConfig, saveApiKey } from './agent/config.js';
import { saveSession, listSessions, loadSession, deleteSession } from './utils/sessionStore.js';

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
    onAgentText(text) { ui.showAgentText(text); },
    onAgentDelta(text) { ui.showAgentDelta(text); },
    onToolStart(name, args) { ui.showToolCall(name, args); },
    onToolResult(_name, output, isError) { ui.showToolResult(output, isError); },
    onQuestion(q, options) { ui.showQuestion(q, options); },
    onError(err) { ui.showError(err); },
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
      ui.close();
      process.exit(0);
    }

    if (lower === '/clear') {
      agent.reset();
      ui.showSystemMessage('Conversation cleared. Starting fresh.');
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
      // Double Ctrl+C — force exit
      process.exit(1);
    }

    console.log('\n\nSaving session before exit... (Ctrl+C again to force quit)');

    try {
      if (running) {
        await saveSession(agent.exportMessages());
        console.log('Session saved.');
      }
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

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
