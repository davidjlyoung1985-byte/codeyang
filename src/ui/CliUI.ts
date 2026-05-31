import * as readline from 'node:readline';
import picocolors from 'picocolors';

export class CliUI {
  private rl: readline.Interface;
  private onInput?: (line: string) => void;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIdx = 0;

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
    console.log(picocolors.dim('/clear to reset  |  /exit to quit'));
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

  showSystemMessage(text: string) {
    console.log();
    console.log(picocolors.dim(`  ⓘ ${text}`));
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
    // Stop spinner before printing full text
    this.stopSpinner();
    for (const line of text.split('\n')) {
      if (line.trim()) {
        console.log(picocolors.green('│ ') + line);
      }
    }
  }

  showAgentDelta(text: string) {
    // Stop spinner before streaming text
    this.stopSpinner();
    process.stdout.write(picocolors.green(text));
  }

  startSpinner() {
    this.stopSpinner();
    this.spinnerIdx = 0;
    process.stdout.write(picocolors.green('│ ') + picocolors.dim(this.spinnerFrames[0]) + ' ');
    this.spinnerTimer = setInterval(() => {
      this.spinnerIdx = (this.spinnerIdx + 1) % this.spinnerFrames.length;
      // Clear the last character and write the new frame
      process.stdout.write('\b' + picocolors.dim(this.spinnerFrames[this.spinnerIdx]));
    }, 120);
  }

  stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
      // Clear spinner character
      process.stdout.write('\b \b');
    }
  }

  showToolCall(name: string, args: Record<string, unknown>) {
    this.stopSpinner();
    const argStr = JSON.stringify(args).slice(0, 200);
    console.log(picocolors.dim(`  ─ 🛠 ${name}(${argStr})`));
  }

  showToolResult(output: string, _isError: boolean) {
    const line = output.split('\n')[0] || '(empty)';
    const prefix = _isError ? '⚠ ' : '';
    console.log(picocolors.dim(`    → ${prefix}${line.slice(0, 150)}`));
  }

  showQuestion(question: string, options?: Array<{ label: string; description: string }>) {
    this.stopSpinner();
    console.log();
    console.log(picocolors.yellow(`? ${question}`));

    if (options && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        console.log(picocolors.yellow(`  ${i + 1}. ${options[i].label}`) + picocolors.dim(` — ${options[i].description}`));
      }
    }

    this.promptForAnswer();
  }

  promptForAnswer() {
    process.stdout.write(picocolors.yellow('▸ '));
  }

  showError(err: string) {
    this.stopSpinner();
    console.log(picocolors.red(`\n✗ ${err}`));
  }

  close() {
    this.stopSpinner();
    this.rl.close();
  }
}
