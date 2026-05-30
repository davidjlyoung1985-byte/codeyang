#!/usr/bin/env node
import * as readline from 'node:readline';
import { CliUI } from './ui/CliUI.js';
import { Agent } from './agent/Agent.js';
import { config, loadLocalConfig, saveApiKey } from './agent/config.js';
import { saveSession, listSessions, loadSession } from './utils/sessionStore.js';

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
    onToolStart(name, args) { ui.showToolCall(name, args); },
    onToolResult(_name, output, isError) { ui.showToolResult(output, isError); },
    onQuestion(q) { ui.showQuestion(q); },
    onError(err) { ui.showError(err); },
  });

  async function handleInput(line: string) {
    if (running) return;
    running = true;

    ui.showUserMessage(line);
    ui.showAgentStart();

    try {
      await agent.run(line);
      await saveSession(agent.exportMessages());
    } catch (err) {
      ui.showError(err instanceof Error ? err.message : String(err));
    }

    running = false;
    ui.showAgentDone();
    ui.promptUser();
  }

  ui.setInputHandler(async (line) => {
    if (['exit', 'quit'].includes(line.toLowerCase())) {
      await saveSession(agent.exportMessages());
      ui.close();
      process.exit(0);
    }

    if (agent.waitingForAnswer) {
      agent.answerQuestion(line);
      return;
    }

    await handleInput(line);
  });

  const sigintHandler = async () => {
    if (running) {
      console.log('\n\nSaving session before exit...');
      await saveSession(agent.exportMessages());
    }
    process.exit(0);
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
