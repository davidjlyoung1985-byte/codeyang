import * as readline from 'node:readline';
import picocolors from 'picocolors';
import { VERSION } from '../version.js';
import type { Message } from '../types.js';

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
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m: string, t: string) => c.bold(c.magenta(t)));
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_m: string, t: string) => c.italic(c.magenta(t)));
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m: string, text: string, url: string) => `${c.magenta(text)} ${c.dim(`(${url})`)}`,
  );
  // Use bright magenta (visible on both light and dark backgrounds) with ANSI bold
  return `\x1b[1m\x1b[35m${out}\x1b[0m`;
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

// ─── ProgressBar (spinner and progress bar) ────────────────────────

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

class ProgressBar {
  private label = '';
  private current = 0;
  private total = 100;
  private startTime = 0;
  private lastDraw = 0;

  start(label: string, total = 100) {
    this.label = label;
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.lastDraw = 0;
    this.draw();
  }

  update(current: number) {
    this.current = Math.min(current, this.total);
    // Throttle updates to avoid excessive redraws
    const now = Date.now();
    if (now - this.lastDraw > 100 || this.current === this.total) {
      this.lastDraw = now;
      this.draw();
    }
  }

  private draw() {
    const percent = Math.floor((this.current / this.total) * 100);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;

    // Calculate ETA based on progress
    let etaStr = '';
    if (this.current > 0 && this.current < this.total) {
      const rate = this.current / elapsed;
      const remaining = (this.total - this.current) / rate;
      if (remaining < 60) {
        etaStr = ` ETA ${Math.ceil(remaining)}s`;
      } else {
        etaStr = ` ETA ${Math.floor(remaining / 60)}m${Math.ceil(remaining % 60)}s`;
      }
    }

    // Progress bar: [████░░░░░░] 40%
    const barWidth = 20;
    const filled = Math.floor((percent / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

    process.stdout.write(
      `\r  ${c.cyan('⟳')} ${this.label} [${c.green(bar)}] ${c.bold(percent + '%')} ${c.dim(timeStr)}${c.dim(etaStr)}`,
    );
  }

  stop(message?: string) {
    process.stdout.write('\r' + ' '.repeat(termW() - 4) + '\r');
    if (message) {
      console.log(`  ${message}`);
    }
  }
}

// ─── CliUI ──────────────────────────────────────────────────────────

export class CliUI {
  private rl: readline.Interface;
  private onInput?: (line: string) => void;
  private spinner = new Spinner();
  private progressBar = new ProgressBar();
  private streamBuf = '';
  private streamBatch: string[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_DELAY_MS = 50;
  private turnCount = 0;
  private isFirstResponse = true;
  private toolStartTimes = new Map<string, number>();
  private toolBatchTotal = 0;
  private toolResultsCount = 0;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: c.cyan('-> '),
      historySize: 50,
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed && this.onInput) {
        this.onInput(trimmed);
      }
    });
  }

  // ─── History Display (for session resume) ───────────────────────────

  /**
   * Display full conversation history — messages, tool calls, and tool results
   * stacked in chronological order so the user can see the full conversation.
   */
  showHistory(messages: Message[]) {
    this.spinner.stop();
    process.stdout.write('\n');
    hr(c.dim('session history'));

    let turnIndex = 0;
    let pendingToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let pendingToolResults: Array<{ output: string; isError: boolean }> = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        // Flush any pending tool context from previous assistant turn
        this.flushToolContext(pendingToolCalls, pendingToolResults);
        pendingToolCalls = [];
        pendingToolResults = [];

        turnIndex++;
        process.stdout.write('\n');
        console.log(`${c.bold(c.yellow('  👤 User'))} ${c.dim(`[#${turnIndex}]`)}`);
        for (const line of msg.content.split('\n')) {
          console.log(`  ${line}`);
        }
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          process.stdout.write('\n');
          console.log(`${c.bold(c.green('  🤖 CodeYang'))} ${c.dim(`[#${turnIndex}]`)}`);
          const rendered = renderMarkdown(msg.content);
          console.log(rendered);
        }
        // Collect tool calls but don't display yet — wait for their results
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            const argStr = Object.entries(tc.args || {})
              .map(([k, v]) => {
                const s = typeof v === 'string' ? v : JSON.stringify(v);
                return s.length > 60 ? `${k}="${s.slice(0, 60)}…"` : `${k}=${JSON.stringify(v)}`;
              })
              .join(' ')
              .slice(0, 100);
            pendingToolCalls.push({ name: tc.name, args: tc.args });
            process.stdout.write(`\n  ${c.dim(c.cyan('  🔧'))} ${c.white(tc.name)} ${c.dim(argStr)}`);
          }
        }
      } else if (msg.role === 'system') {
        process.stdout.write('\n');
        console.log(`  ${c.dim('ℹ')} ${c.dim(msg.content)}`);
      }

      // Collect tool results — they come in the NEXT user message (tool_result pattern)
      if (msg.toolResults && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          pendingToolResults.push({ output: tr.output, isError: tr.isError });
        }
      }
    }

    // Flush any remaining tool context
    this.flushToolContext(pendingToolCalls, pendingToolResults);

    process.stdout.write('\n');
    hr(c.dim('resumed'));
    process.stdout.write('\n');
  }

  /** Display collected tool calls with their results. */
  private flushToolContext(
    calls: Array<{ name: string; args: Record<string, unknown> }>,
    results: Array<{ output: string; isError: boolean }>,
  ) {
    if (calls.length === 0) return;

    // Match tool calls with results by position
    for (let i = 0; i < calls.length; i++) {
      const tc = calls[i];
      const tr = i < results.length ? results[i] : null;

      // Format args
      const argStr = Object.entries(tc.args || {})
        .map(([k, v]) => {
          const s = typeof v === 'string' ? v : JSON.stringify(v);
          return s.length > 60 ? `${k}="${s.slice(0, 60)}…"` : `${k}=${JSON.stringify(v)}`;
        })
        .join(' ')
        .slice(0, 100);

      process.stdout.write(`\n  ${c.dim(c.cyan('  🔧'))} ${c.white(tc.name)} ${c.dim(argStr)}`);

      if (tr) {
        const firstLine = tr.output.split('\n')[0] || '(empty)';
        const display = firstLine.slice(0, 150);
        const lines = tr.output.split('\n').length;
        const suffix = lines > 1 ? ` ${c.dim(`(${lines} lines)`)}` : '';
        if (tr.isError) {
          process.stdout.write(`\n  ${c.red('  ✗')} ${c.dim(display)}${suffix}`);
        } else {
          process.stdout.write(`\n  ${c.green('  ✓')} ${c.dim(display)}${suffix}`);
        }
      }
    }
    process.stdout.write('\n');
  }

  setInputHandler(handler: (line: string) => void) {
    this.onInput = handler;
  }

  // ─── Welcome ──────────────────────────────────────────────────────

  welcome() {
    const w = termW();
    console.log('');
    console.log(c.cyan('  ╭' + '─'.repeat(w - 4) + '╮'));
    console.log(
      c.cyan('  │') +
        '  ' +
        c.bold(c.green('CodeYang')) +
        c.dim(' v' + VERSION) +
        c.dim(' — AI Coding Agent') +
        ' '.repeat(w - 36 - VERSION.length) +
        c.cyan('│'),
    );
    console.log(
      c.cyan('  │') + '  ' + c.dim('💡 64+ Tools | Qt Support | Code Refactoring') + ' '.repeat(w - 52) + c.cyan('│'),
    );
    console.log(c.cyan('  ╰' + '─'.repeat(w - 4) + '╯'));
    console.log('');
    console.log(
      `  ${c.dim('Commands:')} ${c.cyan('/clear')} ${c.cyan('/sessions')} ${c.cyan('/stats')} ${c.cyan('/model')} ${c.cyan('/mcp')}  ${c.dim('·')}  ${c.dim('Ctrl+C to exit')}`,
    );
    console.log('');
    hr('ready');
    this.isFirstResponse = true;
  }

  promptUser() {
    this.rl.prompt();
  }

  setToolProgressTotal(total: number) {
    this.toolBatchTotal = total;
    this.toolResultsCount = 0;
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
    this.clearBatch();
    this.streamBuf = '';
    process.stdout.write('\n');
    this.isFirstResponse = true;
  }

  showAgentText(text: string) {
    this.clearBatch();
    this.spinner.stop();
    if (this.streamBuf) {
      // Streaming was in progress — text already shown via showAgentDelta
      process.stdout.write('\n');
      this.streamBuf = '';
      this.spinner.stop();
      return;
    }
    // No streaming happened — render as markdown (non-streaming response)
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

    // Batch tokens for smoother display
    this.streamBatch.push(text);
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_DELAY_MS);
    }
  }

  private flushBatch() {
    this.batchTimer = null;
    const batch = this.streamBatch.join('');
    this.streamBatch = [];
    process.stdout.write(batch.replace(/\n/g, '\n  '));
    this.streamBuf += batch;
  }

  private clearBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.streamBatch.length > 0) {
      this.flushBatch();
    }
  }

  startSpinner(label = 'thinking') {
    this.spinner.start(label);
  }

  stopSpinner() {
    this.spinner.stop();
  }

  // Progress bar methods for long-running operations
  startProgress(label: string, total = 100) {
    this.clearBatch();
    this.spinner.stop();
    this.progressBar.start(label, total);
  }

  updateProgress(current: number) {
    this.progressBar.update(current);
  }

  stopProgress(message?: string) {
    this.progressBar.stop(message);
  }

  // ─── Tools ────────────────────────────────────────────────────────

  showToolCall(name: string, args: Record<string, unknown>) {
    this.clearBatch();
    this.spinner.stop();
    this.toolStartTimes.set(name, Date.now());
    const argStr = Object.entries(args)
      .map(([k, v]) => {
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return s.length > 60 ? `${k}="${s.slice(0, 60)}…"` : `${k}=${JSON.stringify(v)}`;
      })
      .join(' ')
      .slice(0, 100);
    const icon = name === 'Question' ? '?' : '>';
    const progress = this.toolBatchTotal > 0 ? ` (${this.toolResultsCount + 1}/${this.toolBatchTotal})` : '';
    process.stdout.write(`\n  ${c.dim(`${c.cyan(icon)} ${c.white(name)}${progress}`)} ${c.dim(argStr)}\n`);
  }

  showToolResult(output: string, isError: boolean) {
    const name = Array.from(this.toolStartTimes.keys()).pop() || '';
    const elapsed = this.toolStartTimes.get(name);
    const duration = elapsed ? ` ${c.dim('[' + (Date.now() - elapsed) + 'ms]')}` : '';
    this.toolResultsCount++;
    if (isError) {
      const firstLine = output.split('\n')[0] || '(empty)';
      const display = firstLine.slice(0, 120);
      const lines = output.split('\n').length;
      const suffix = lines > 1 ? `  (${lines} lines \u2014 see full error above)` : '';
      console.log(`  ${c.red('\u2717')}${duration} ${c.dim(display)}${suffix}`);
    } else {
      const firstLine = output.split('\n')[0] || '(empty)';
      const display = firstLine.slice(0, 150);
      console.log(`  ${c.dim('\u00b7')}${duration} ${c.dim(display)}`);
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
    this.rl.prompt(true);
  }

  // ─── Error ────────────────────────────────────────────────────────

  showError(err: string) {
    this.clearBatch();
    this.spinner.stop();
    console.log(`\n  ${c.red('✗')} ${c.red(err)}`);
  }

  close() {
    this.spinner.stop();
    this.rl.close();
  }
}
