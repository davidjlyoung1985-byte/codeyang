import * as readline from 'node:readline';
import picocolors from 'picocolors';

const c = picocolors;

/** Terminal width, clamped to a max to keep things readable on wide screens */
function termW(): number {
  return Math.min(process.stdout.columns || 80, 120);
}

/** Print a visually distinct horizontal separator */
function hr(label?: string): void {
  const w = termW();
  if (label) {
    const side = Math.max(0, (w - label.length - 4) >> 1);
    console.log(c.dim('─'.repeat(side) + `  ${label}  ` + '─'.repeat(side)));
  } else {
    console.log(c.dim('─'.repeat(w)));
  }
}

/** Draw a box around content. level: 0=main, 1=nested */
function box(content: string, title?: string, level = 0): void {
  const tl = level === 0 ? '╭' : '┌';
  const bl = level === 0 ? '╰' : '└';
  const color = level === 0 ? c.green : c.yellow;
  const w = termW() - 2;

  if (title) {
    console.log(color(`${tl}─ ${title} ` + '─'.repeat(Math.max(0, w - title.length - 3))));
  } else {
    console.log(color(tl + '─'.repeat(w)));
  }

  for (const line of content.split('\n')) {
    // Strip existing leading │ from rendered sub-blocks before re-wrapping
    const stripped = line.startsWith('│ ') ? line.slice(2) : line;
    // Word-wrap for long lines but keep code blocks intact (no wrap)
    if (stripped.length > w) {
      const words = stripped.split(' ');
      let cur = '';
      for (const word of words) {
        if ((cur + word).length > w) {
          console.log(color('│ ') + cur.trimEnd());
          cur = word + ' ';
        } else {
          cur += word + ' ';
        }
      }
      if (cur.trim()) console.log(color('│ ') + cur.trimEnd());
    } else {
      console.log(color('│ ') + stripped);
    }
  }

  console.log(color(bl + '─'.repeat(w)));
}

// ─── Markdown rendering (lightweight, no external deps) ─────────────────────

function bold(text: string): string {
  // ANSI bold escape
  return `\x1b[1m${text}\x1b[22m`;
}

function renderMarkdownLine(line: string): string {
  let out = line;

  // Code blocks — highlight as a block (handled at block level in renderMarkdown)
  // Inline code: `text`
  out = out.replace(/`([^`]+)`/g, (_m: string, code: string) => c.cyan(code));

  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m: string, text: string) => bold(text));

  // Italic: *text* (but not ** which was already handled)
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_m: string, text: string) => c.italic(text));

  // Links: [text](url) — show text, dim url
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m: string, text: string, url: string) => `${text} ${c.dim(`(${url})`)}`,
  );

  // Headers: ### text, ## text, # text
  if (/^#{1,3}\s/.test(out)) {
    out = bold(c.yellow(out));
  }

  // Blockquotes
  if (/^>\s/.test(out)) {
    out = c.dim(out);
  }

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
        // Render collected code block
        if (codeLines.length > 0) {
          result.push(c.dim(`  ┌─ ${codeLang || 'code'} ────────────────────────`));
          for (const cl of codeLines) {
            result.push(`  │ ${c.dim(cl)}`);
          }
          result.push(c.dim('  └─' + '─'.repeat(Math.min(50, codeLang.length > 0 ? codeLang.length + 8 : 4))));
        }
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      result.push(c.dim('  ───────────────'));
      continue;
    }

    result.push(renderMarkdownLine(line));
  }

  // Unterminated code block
  if (inCodeBlock && codeLines.length > 0) {
    result.push(c.dim(`  ┌─ ${codeLang || 'code'}`));
    for (const cl of codeLines) result.push(`  │ ${c.dim(cl)}`);
    result.push(c.dim('  └─'));
  }

  return result.join('\n');
}

// ─── Spinner ────────────────────────────────────────────────────────────────

class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private idx = 0;
  private frames = ['◜', '◠', '◝', '◞', '◡', '◟'];
  private prefix = '';

  start(prefix = '') {
    this.stop();
    this.idx = 0;
    this.prefix = prefix;
    process.stdout.write(prefix + ' ' + this.frames[0]);
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % this.frames.length;
      process.stdout.write(`\r${prefix} ${this.frames[this.idx]}`);
    }, 100);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Clear the line
      process.stdout.write('\r' + ' '.repeat(this.prefix.length + 2) + '\r');
    }
  }

  get active(): boolean {
    return this.timer !== null;
  }
}

// ─── CliUI ──────────────────────────────────────────────────────────────────

export class CliUI {
  private rl: readline.Interface;
  private onInput?: (line: string) => void;
  private spinner = new Spinner();
  private streamBuf = '';
  private turnCount = 0;

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

  // ─── Welcome ──────────────────────────────────────────────────

  welcome() {
    console.log('');
    console.log(c.bold(c.green('  ╔══════════════════════════════════════════════╗')));
    console.log(
      c.bold(c.green('  ║')) +
        c.bold(c.white('  CodeYang  ')) +
        c.dim('AI Coding Agent') +
        c.bold(c.green('            ║')),
    );
    console.log(c.bold(c.green('  ╚══════════════════════════════════════════════╝')));
    console.log('');
    console.log(c.dim('  /clear  Reset conversation'));
    console.log(c.dim('  Ctrl+C  Save & exit'));
    console.log('');
    hr('ready');
    console.log('');
    process.stdout.write('  ' + c.cyan('❯ '));
  }

  promptUser() {
    process.stdout.write('\n  ' + c.cyan('❯ '));
  }

  // ─── Messages ──────────────────────────────────────────────────

  showUserMessage(text: string) {
    this.spinner.stop();
    this.turnCount++;
    console.log('');
    box(text, 'You', 1);
  }

  showSystemMessage(text: string) {
    console.log(c.dim(`\n  ${text}\n`));
  }

  showAgentStart() {
    // Just a visual indicator that the agent is thinking
  }

  showAgentDone() {
    this.streamBuf = '';
    console.log('');
  }

  showAgentText(text: string) {
    this.spinner.stop();
    // Clear any in-progress streaming indicator
    if (this.streamBuf) {
      process.stdout.write('\r' + ' '.repeat(20) + '\r');
    }
    this.streamBuf = '';
    const rendered = renderMarkdown(text);
    for (const line of rendered.split('\n')) {
      console.log('  ' + line);
    }
  }

  showAgentDelta(_text: string) {
    // Buffer silently; showAgentText handles the formatted output.
    // Keep spinner active for live-stream feel.
    this.streamBuf += _text;
  }

  startSpinner() {
    this.spinner.start(c.dim('  │'));
  }

  stopSpinner() {
    this.spinner.stop();
  }

  // ─── Tools ─────────────────────────────────────────────────────

  showToolCall(name: string, args: Record<string, unknown>) {
    this.spinner.stop();
    const argStr = Object.entries(args)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ')
      .slice(0, 120);
    console.log('');
    console.log(c.dim(`  ╭─ 🛠  ${c.yellow(name)}`));
    console.log(c.dim(`  │   ${c.dim(argStr)}`));
    console.log(c.dim('  ╰─'));
  }

  showToolResult(output: string, isError: boolean) {
    const head = output.split('\n')[0] || '(empty)';
    const display = head.slice(0, 200);
    const prefix = isError ? c.red('✗') : c.dim('→');
    console.log(c.dim(`    ${prefix} ${display}`));
  }

  // ─── Question ──────────────────────────────────────────────────

  showQuestion(question: string, options?: Array<{ label: string; description: string }>) {
    this.spinner.stop();
    console.log('');
    console.log(c.yellow(`  ┌─ ? ${question}`));

    if (options && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        const label = `  ${i + 1}. ${options[i].label}`;
        console.log(c.yellow(label) + c.dim(`  — ${options[i].description}`));
      }
    }
    console.log(c.yellow('  └─'));
    this.promptForAnswer();
  }

  promptForAnswer() {
    process.stdout.write(c.yellow('  ▸ '));
  }

  // ─── Error ─────────────────────────────────────────────────────

  showError(err: string) {
    this.spinner.stop();
    console.log(c.red(`\n  ✗ ${err}`));
  }

  close() {
    this.spinner.stop();
    this.rl.close();
  }
}
