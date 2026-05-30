import * as readline from 'node:readline';
import picocolors from 'picocolors';

export class CliUI {
  private rl: readline.Interface;
  private onInput?: (line: string) => void;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: '',
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed && this.onInput) {
        this.onInput(trimmed);
      }
    });
  }

  setInputHandler(handler: (line: string) => void) {
    this.onInput = handler;
  }

  welcome() {
    console.log(picocolors.green('╔══════════════════════════════════════════╗'));
    console.log(picocolors.green('║') + picocolors.bold('  CodeYang') + picocolors.dim(' — AI Coding Agent      ') + picocolors.green('║'));
    console.log(picocolors.green('╚══════════════════════════════════════════╝'));
    console.log();
    console.log(picocolors.dim('Type your request and press Enter. Ctrl+C to exit.'));
    console.log(picocolors.dim('Available: Bash, Read, Write, Edit, Glob, Grep, Task'));
    console.log();
  }

  promptUser() {
    process.stdout.write(picocolors.cyan('❯ '));
  }

  showUserMessage(text: string) {
    console.log();
    console.log(picocolors.cyan('┌─ You'));
    for (const line of text.split('\n')) {
      console.log(picocolors.cyan('│ ') + line);
    }
    console.log();
  }

  showAgentDone() {
    console.log(picocolors.green('└──'));
    console.log();
  }

  showAgentStart() {
    console.log(picocolors.green('┌─ CodeYang'));
  }

  showAgentText(text: string) {
    for (const line of text.split('\n')) {
      if (line.trim()) {
        console.log(picocolors.green('│ ') + line);
      }
    }
  }

  showToolCall(name: string, args: Record<string, unknown>) {
    const argStr = JSON.stringify(args).slice(0, 200);
    console.log(picocolors.dim(`  ─ 🛠 ${name}(${argStr})`));
  }

  showToolResult(output: string, _isError: boolean) {
    const line = output.split('\n')[0] || '(empty)';
    const prefix = _isError ? '⚠ ' : '';
    console.log(picocolors.dim(`    → ${prefix}${line.slice(0, 150)}`));
  }

  showQuestion(question: string) {
    console.log(picocolors.yellow(`\n? ${question}`));
    this.promptForAnswer();
  }

  promptForAnswer() {
    process.stdout.write(picocolors.yellow('▸ '));
  }

  showError(err: string) {
    console.log(picocolors.red(`\n✗ ${err}`));
  }

  close() {
    this.rl.close();
  }
}
