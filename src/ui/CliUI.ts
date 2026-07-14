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
  let inThinking = false;
  let thinkingLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle thinking blocks
    if (line.includes('<thinking>') || line.includes('<thinking_mode>')) {
      inThinking = true;
      thinkingLines = [];
      continue;
    }
    if (line.includes('</thinking>') || line.includes('</thinking_mode>')) {
      inThinking = false;
      if (thinkingLines.length > 0) {
        // Render collapsed thinking block
        const lineCount = thinkingLines.length;
        const preview = thinkingLines[0]?.substring(0, 60) || 'AI reasoning process';
        result.push('');
        result.push(c.dim(`  💭 [思考过程已折叠 - ${lineCount} 行]`));
        result.push(c.dim(`     ${preview}...`));
        result.push('');
      }
      thinkingLines = [];
      continue;
    }
    if (inThinking) {
      thinkingLines.push(line);
      continue;
    }

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

// ─── Tool call buffer (folded display) ────────────────────────────

interface ToolEntry {
  name: string;
  argStr: string;
  durationMs: number;
  isError: boolean;
  lineCount: number;
  preview: string;
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

  /** 工具调用 buffer：收集一轮中的所有调用，最后折叠展示 */
  private toolBuffer: ToolEntry[] = [];
  /** 当前是否在 buffer 模式（有工具调用正在执行） */
  private toolBuffering = false;

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
            pendingToolCalls.push({ name: tc.name, args: tc.args });
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

  /** Display collected tool calls with their results — compact folded style. */
  private flushToolContext(
    calls: Array<{ name: string; args: Record<string, unknown> }>,
    results: Array<{ output: string; isError: boolean }>,
  ) {
    if (calls.length === 0) return;

    const w = termW();
    const label = `  🔧 工具调用 (${calls.length}) `;
    const side = Math.max(0, w - label.length - 4);
    console.log(`\n  ${c.dim('┌')}${c.dim('─'.repeat(side))}`);

    for (let i = 0; i < calls.length; i++) {
      const tc = calls[i];
      const tr = i < results.length ? results[i] : null;

      const argStr = Object.entries(tc.args || {})
        .map(([k, v]) => {
          const s = typeof v === 'string' ? v : JSON.stringify(v);
          return s.length > 60 ? `${k}="${s.slice(0, 60)}…"` : `${k}=${JSON.stringify(v)}`;
        })
        .join(' ')
        .slice(0, 100);

      if (tr) {
        const firstLine = tr.output.split('\n')[0] || '(empty)';
        const display = firstLine.slice(0, 150);
        const lines = tr.output.split('\n').length;
        const suffix = lines > 1 ? ` [输出 ${lines} 行]` : '';
        const icon = tr.isError ? c.red('✗') : c.dim('·');
        console.log(
          `  ${c.dim('│')} ${icon} ${c.white(tc.name)} ${c.dim(argStr)}${tr.isError ? c.red(` ${display}`) : c.dim(` ${display}`)}${c.dim(suffix)}`,
        );
      } else {
        console.log(`  ${c.dim('│')} ${c.dim('·')} ${c.white(tc.name)} ${c.dim(argStr)}`);
      }
    }

    console.log(`  ${c.dim('└')}${c.dim('─'.repeat(side))}`);
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
    // 工具 buffer 未 flush（如单工具无 toolBatchTotal 场景），兜底 flush
    if (this.toolBuffering && this.toolBuffer.length > 0) {
      this.flushToolBatch();
    } else if (this.spinner.active) {
      this.spinner.stop();
    }
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

  // ─── Tools (folded display) ───────────────────────────────────

  /** 工具开始时：记录到 buffer，更新 spinner 进度 */
  showToolCall(name: string, args: Record<string, unknown>) {
    this.clearBatch();
    this.toolBuffering = true;

    const argStr = Object.entries(args)
      .map(([k, v]) => {
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return s.length > 60 ? `${k}="${s.slice(0, 60)}…"` : `${k}=${JSON.stringify(v)}`;
      })
      .join(' ')
      .slice(0, 100);

    this.toolBuffer.push({
      name,
      argStr,
      durationMs: 0,
      isError: false,
      lineCount: 0,
      preview: '',
    });

    this.toolStartTimes.set(name + ':' + this.toolBuffer.length, Date.now());

    // 用 spinner 显示执行进度，不逐行打印
    const idx = this.toolBuffer.length;
    const total = this.toolBatchTotal || '?';
    this.spinner.start(`${name} (${idx}/${total})`);
  }

  /** 工具完成时：更新 buffer 条目，累计完成后折叠展示 */
  showToolResult(name: string, output: string, isError: boolean) {
    const key = name + ':' + this.toolBuffer.length;
    const elapsed = this.toolStartTimes.get(key);
    const durationMs = elapsed ? Date.now() - elapsed : 0;
    const lines = output.split('\n');
    const lineCount = lines.length;
    const preview = lines[0]?.slice(0, 80) || '(empty)';

    // 更新 buffer 中最后一个匹配的未完成条目
    for (let i = this.toolBuffer.length - 1; i >= 0; i--) {
      const e = this.toolBuffer[i];
      if (e.name === name && e.durationMs === 0 && !e.isError) {
        e.durationMs = durationMs;
        e.isError = isError;
        e.lineCount = lineCount;
        e.preview = preview;
        break;
      }
    }

    this.toolResultsCount++;

    // 更新 spinner 显示累计进度
    const ok = this.toolBuffer.filter((e) => e.durationMs > 0 && !e.isError).length;
    const fail = this.toolBuffer.filter((e) => e.isError).length;
    const totalStr = this.toolBatchTotal > 0 ? `/${this.toolBatchTotal}` : '';
    const status = fail > 0 ? `${ok}✓ ${fail}✗` : `${ok}✓`;
    this.spinner.start(`${status}${totalStr}`);

    // 批次完成后自动折叠展示
    if (this.toolBatchTotal > 0 && this.toolResultsCount >= this.toolBatchTotal) {
      this.flushToolBatch();
    }
  }

  /** 折叠展示 buffer 中的所有工具调用 */
  private flushToolBatch(): void {
    if (this.toolBuffer.length === 0) return;

    this.spinner.stop();

    const successCount = this.toolBuffer.filter((e) => !e.isError).length;
    const failCount = this.toolBuffer.filter((e) => e.isError).length;
    const totalMs = this.toolBuffer.reduce((sum, e) => sum + e.durationMs, 0);
    const w = termW();

    // ── 折叠块头部 ──
    const label = `  🔧 工具调用 (${this.toolBuffer.length}) `;
    const side = Math.max(0, w - label.length - 4);
    console.log(`\n  ${c.dim('┌')}${c.dim('─'.repeat(side))}`);

    // ── 每个工具一行 ──
    for (const e of this.toolBuffer) {
      const icon = e.isError ? c.red('✗') : c.dim('·');
      const dur = e.durationMs > 0 ? c.dim(` ${e.durationMs}ms`) : '';
      let info: string;
      if (e.isError) {
        info = c.red(` ${e.preview || '(error)'}`);
      } else if (e.lineCount > 3) {
        info = c.dim(` [输出 ${e.lineCount} 行] ${e.preview}...`);
      } else if (e.preview) {
        info = c.dim(` ${e.preview}`);
      } else {
        info = '';
      }
      console.log(`  ${c.dim('│')} ${icon} ${c.white(e.name)} ${c.dim(e.argStr)}${dur}${info}`);
    }

    // ── 折叠块尾部汇总 ──
    const summary =
      failCount > 0
        ? c.yellow(`${successCount} 成功, ${failCount} 失败 · ${totalMs}ms`)
        : c.green(`全部成功 · ${totalMs}ms`);
    console.log(`  ${c.dim('└')}${c.dim('─'.repeat(side))} ${summary}`);

    // ── 重置 buffer ──
    this.toolBuffer = [];
    this.toolBuffering = false;
    this.toolBatchTotal = 0;
    this.toolResultsCount = 0;
    this.toolStartTimes.clear();
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
