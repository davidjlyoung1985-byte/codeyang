import * as readline from 'node:readline';
import picocolors from 'picocolors';
import { VERSION } from '../version.js';

const c = picocolors;

function termW(): number {
  return Math.min(process.stdout.columns || 80, 120);
}

function hr(label?: string): void {
  const w = termW();
  if (label) {
    const side = Math.max(0, (w - label.length - 4) >> 1);
    console.log(c.dim('─'.repeat(side) + `  ${label}  ` + '─'.repeat(side)));
  } else {
    console.log(c.dim('─'.repeat(w)));
  }
}

function renderInlineMarkdown(text: string): string {
  let out = text;
  out = out.replace(/`([^`]+)`/g, (_m: string, code: string) => c.cyan(code));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m: string, t: string) => `\x1b[1m${t}\x1b[22m`);
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_m: string, t: string) => c.italic(t));
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m: string, text: string, url: string) => `${text} ${c.dim(`(${url})`)}`,
  );
  return out;
}

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        inCodeBlock = false;
        if (codeLines.length > 0) {
          const lang = codeLang || 'code';
          const border = '─'.repeat(Math.min(termW() - 6, 40));
          result.push(c.dim(`  ┌${border} ${lang} ${border}`));
          for (const cl of codeLines) {
            result.push(`  │ ${cl}`);
          }
          result.push(c.dim(`  └${border}${'─'.repeat(lang.length + 1)}${border}`));
        }
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
      result.push('');
      result.push(c.dim('  ─────────────────────────'));
      result.push('');
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      result.push(`  ${c.bold(c.yellow(line))}`);
      continue;
    }

    if (/^>\s/.test(line)) {
      result.push(`  ${c.dim(line)}`);
      continue;
    }

    if (/^[-*+]\s/.test(line.trim())) {
      result.push(`  ${renderInlineMarkdown(line)}`);
      continue;
    }

    result.push(`  ${renderInlineMarkdown(line)}`);
  }

  if (inCodeBlock && codeLines.length > 0) {
    result.push(c.dim(`  ┌─ ${codeLang || 'code'}`));
    for (const cl of codeLines) result.push(`  │ ${c.dim(cl)}`);
    result.push(c.dim('  └─'));
  }

  return result.join('\n');
}

// ─── ProgressBar (spinner) ──────────────────────────────────────────

class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private label = '';
  private startTime = 0;
  private spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  start(label = '') {
    this.stop();
    this.label = label;
    this.startTime = Date.now();
    this.draw();
    this.timer = setInterval(() => this.draw(), 80);
  }

  private draw() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
    const char = this.spinnerChars[Math.floor(Date.now() / 80) % this.spinnerChars.length];
    const dots = '.'.repeat(3 - Math.min(3, Math.floor(elapsed / 2) % 4));
    process.stdout.write(`\r  ${c.cyan(char)} ${c.dim(this.label)}${dots} ${c.dim(timeStr)}`);
  }

  updateLabel(label: string) {
    this.label = label;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write('\r' + ' '.repeat(termW() - 4) + '\r');
    }
  }

  get active(): boolean {
    return this.timer !== null;
  }
}

// ─── CliUI ──────────────────────────────────────────────────────────

export class CliUI {
  private rl: readline.Interface;
  private onInput?: (line: string) => void;
  private spinner = new Spinner();
  private streamBuf = '';
  private turnCount = 0;
  private isFirstResponse = true;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: '',
      historySize: 50,
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

  // ─── Welcome ──────────────────────────────────────────────────────

  welcome() {
    console.log('');
    console.log(`  ${c.bold(c.green('CodeYang'))} ${c.dim(`v${VERSION}`)}  ${c.dim('—')}  ${c.dim('AI Coding Agent')}`);
    console.log('');
    console.log(
      `  ${c.dim('/clear')}  ${c.dim('/sessions')}  ${c.dim('/model')}  ${c.dim('/mcp')}  ${c.dim('·')}  ${c.dim('Ctrl+C to exit')}`,
    );
    console.log('');
    hr('ready');
    this.isFirstResponse = true;
  }

  promptUser() {
    process.stdout.write(`\n  ${c.cyan('->')} `);
  }

  setToolProgressTotal(_total: number) {
    // handled by individual tool calls
  }

  // ─── Messages ─────────────────────────────────────────────────────

  showUserMessage(text: string) {
    this.spinner.stop();
    this.turnCount++;
    process.stdout.write('\n');
    hr();
    console.log(`${c.bold(c.yellow('  👤 User'))}${c.dim(':')}`);
    for (const line of text.split('\n')) {
      console.log(`  ${line}`);
    }
  }

  showSystemMessage(text: string) {
    process.stdout.write('\n');
    console.log(`  ${c.dim('·')} ${c.dim(text)}\n`);
    this.promptUser();
  }

  showAgentStart() {
    this.isFirstResponse = true;
    process.stdout.write('\n');
    console.log(`${c.bold(c.green('  🤖 CodeYang'))}${c.dim(':')}`);
    process.stdout.write('\n');
  }

  showAgentDone() {
    this.streamBuf = '';
    process.stdout.write('\n');
    this.isFirstResponse = true;
  }

  showAgentText(text: string) {
    if (this.streamBuf) {
      // Streaming was in progress — flush the buffer, then show text
      process.stdout.write('\n');
      this.streamBuf = '';
    }
    this.spinner.stop();
    const rendered = renderMarkdown(text);
    console.log(rendered);
  }

  showAgentDelta(text: string) {
    if (this.spinner.active) {
      this.spinner.stop();
      if (!this.isFirstResponse) {
        process.stdout.write('\n');
      }
      this.isFirstResponse = false;
    }
    process.stdout.write(text.replace(/\n/g, '\n  '));
    this.streamBuf += text;
  }

  startSpinner(label = 'thinking') {
    this.spinner.start(label);
  }

  stopSpinner() {
    this.spinner.stop();
  }

  // ─── Tools ────────────────────────────────────────────────────────

  showToolCall(name: string, args: Record<string, unknown>) {
    this.spinner.stop();
    this.spinner.start(`executing ${name}`);
    const argStr = Object.entries(args)
      .map(([k, v]) => {
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return s.length > 60 ? `${k}="${s.slice(0, 60)}…"` : `${k}=${JSON.stringify(v)}`;
      })
      .join(' ')
      .slice(0, 100);
    const icon = name === 'Question' ? '?' : '>';
    process.stdout.write(`\n  ${c.dim(`${c.cyan(icon)} ${c.white(name)}`)} ${c.dim(argStr)}\n`);
  }

  showToolResult(output: string, isError: boolean) {
    if (isError) {
      const firstLine = output.split('\n')[0] || '(empty)';
      const display = firstLine.slice(0, 120);
      const lines = output.split('\n').length;
      const suffix = lines > 1 ? `  (${lines} lines \u2014 see full error above)` : '';
      console.log(`  ${c.red('\u2717')} ${c.dim(display)}${suffix}`);
    } else {
      const firstLine = output.split('\n')[0] || '(empty)';
      const display = firstLine.slice(0, 150);
      console.log(`  ${c.dim('\u00b7')} ${c.dim(display)}`);
    }
  }

  // ─── Question ─────────────────────────────────────────────────────

  showQuestion(question: string, options?: Array<{ label: string; description: string }>) {
    this.spinner.stop();
    console.log('');
    console.log(`  ${c.yellow('?')} ${c.bold(question)}`);

    if (options && options.length > 0) {
      console.log('');
      for (let i = 0; i < options.length; i++) {
        console.log(`    ${c.cyan(`${i + 1}.`)} ${c.white(options[i].label)}`);
        console.log(`       ${c.dim(options[i].description)}`);
      }
    }
    console.log('');
    this.promptForAnswer();
  }

  promptForAnswer() {
    process.stdout.write(`  ${c.yellow('▸')} `);
  }

  // ─── Error ────────────────────────────────────────────────────────

  showError(err: string) {
    this.spinner.stop();
    console.log(`\n  ${c.red('✗')} ${c.red(err)}`);
  }

  close() {
    this.spinner.stop();
    this.rl.close();
  }
}
