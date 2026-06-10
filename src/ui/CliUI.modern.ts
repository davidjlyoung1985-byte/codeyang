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

function box(content: string, style: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
  const w = termW();
  const lines = content.split('\n');
  const maxLen = Math.max(...lines.map((l) => l.length));
  const boxWidth = Math.min(maxLen + 4, w - 4);

  let borderColor = c.blue;
  let icon = 'ℹ';

  switch (style) {
    case 'success':
      borderColor = c.green;
      icon = '✓';
      break;
    case 'error':
      borderColor = c.red;
      icon = '✗';
      break;
    case 'warning':
      borderColor = c.yellow;
      icon = '⚠';
      break;
  }

  console.log(borderColor('╭' + '─'.repeat(boxWidth - 2) + '╮'));
  console.log(borderColor('│') + ` ${icon} ${content.padEnd(boxWidth - 6)} ` + borderColor('│'));
  console.log(borderColor('╰' + '─'.repeat(boxWidth - 2) + '╯'));
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

export class CliUI {
  private rl: readline.Interface;
  private spinner: { start: (text: string) => void; stop: () => void; text?: string };

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let interval: NodeJS.Timeout | null = null;
    let currentText = '';
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;

    this.spinner = {
      start: (text: string) => {
        currentText = text;
        frameIndex = 0;
        process.stdout.write('\n');
        interval = setInterval(() => {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(`  ${c.cyan(frames[frameIndex])} ${c.dim(currentText)}`);
          frameIndex = (frameIndex + 1) % frames.length;
        }, 80);
      },
      stop: () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
        }
      },
    };

    Object.defineProperty(this.spinner, 'text', {
      set: (newText: string) => {
        currentText = newText;
      },
    });
  }

  // ─── Banner ───────────────────────────────────────────────────────

  showBanner() {
    const w = termW();
    console.log('');
    console.log(c.cyan('  ╭' + '─'.repeat(w - 4) + '╮'));
    console.log(
      c.cyan('  │') +
        c.bold(c.cyan('  CodeYang')) +
        c.dim(' v' + VERSION) +
        ' '.repeat(w - 20 - VERSION.length) +
        c.cyan('│'),
    );
    console.log(c.cyan('  │') + c.dim('  AI Coding Agent with 64+ Tools') + ' '.repeat(w - 38) + c.cyan('│'));
    console.log(c.cyan('  ╰' + '─'.repeat(w - 4) + '╯'));
    console.log('');
    console.log(c.dim('  💡 Type your request or /help for commands'));
    console.log('');
  }

  showSessionInfo(sessionId: string, model: string) {
    console.log('');
    console.log(`  ${c.dim('Session:')} ${c.cyan(sessionId.slice(0, 8))}  ${c.dim('Model:')} ${c.green(model)}`);
    hr();
  }

  // ─── Messages ─────────────────────────────────────────────────────

  showUserMessage(text: string) {
    console.log('');
    console.log(`  ${c.bold(c.blue('You'))} ${c.dim('▸')}`);
    console.log('');
    this.renderMultiline(text, '  ');
    console.log('');
  }

  showAssistantMessage(text: string) {
    this.spinner.stop();
    console.log('');
    console.log(`  ${c.bold(c.green('AI'))} ${c.dim('▸')}`);
    console.log('');
    this.renderMultiline(text, '  ');
    console.log('');
  }

  showThinking(text: string) {
    this.spinner.stop();
    console.log('');
    console.log(`  ${c.dim('💭')} ${c.italic(c.dim(text))}`);
  }

  // ─── Tool Execution ───────────────────────────────────────────────

  showToolUse(toolName: string, args: Record<string, unknown>) {
    this.spinner.stop();
    console.log('');
    console.log(`  ${c.magenta('⚡')} ${c.bold(c.magenta(toolName))}`);

    const preview = this.previewArgs(args);
    if (preview) {
      console.log(`     ${c.dim(preview)}`);
    }
  }

  private previewArgs(args: Record<string, unknown>): string {
    const keys = Object.keys(args);
    if (keys.length === 0) return '';
    if (keys.length === 1) {
      const val = String(args[keys[0]]);
      return val.length > 60 ? val.slice(0, 57) + '...' : val;
    }
    return keys.map((k) => `${k}=...`).join(', ');
  }

  showToolResult(result: string) {
    this.spinner.stop();
    if (!result.trim()) return;

    const lines = result.split('\n');
    const preview = lines.slice(0, 10);

    console.log('');
    for (const line of preview) {
      console.log(`  ${c.dim('│')} ${c.dim(line)}`);
    }

    if (lines.length > 10) {
      console.log(`  ${c.dim('│')} ${c.dim(`... (${lines.length - 10} more lines)`)}`);
    }
  }

  showToolError(error: string) {
    this.spinner.stop();
    console.log('');
    console.log(`  ${c.red('✗')} ${c.red(error)}`);
  }

  // ─── Markdown Rendering ───────────────────────────────────────────

  private renderMultiline(text: string, prefix: string) {
    const lines = text.split('\n');
    let inCodeBlock = false;
    let codeBlockLang = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block fence
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          codeBlockLang = line.trim().slice(3).trim();
          inCodeBlock = true;
          console.log(prefix + c.dim('┌─ ' + (codeBlockLang || 'code') + ' ───'));
        } else {
          console.log(prefix + c.dim('└' + '─'.repeat(Math.min(termW() - prefix.length - 1, 60))));
          inCodeBlock = false;
        }
        continue;
      }

      if (inCodeBlock) {
        console.log(prefix + c.dim('│ ') + c.cyan(line));
      } else if (line.trim().startsWith('#')) {
        // Headers
        const level = line.match(/^#+/)?.[0].length || 0;
        const text = line.replace(/^#+\s*/, '');
        if (level === 1) {
          console.log(prefix + c.bold(c.white(text)));
        } else if (level === 2) {
          console.log(prefix + c.bold(text));
        } else {
          console.log(prefix + c.bold(c.dim(text)));
        }
      } else if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        // Lists
        const bullet = c.cyan('•');
        const text = line.replace(/^[\s\-\*]+/, '');
        console.log(prefix + bullet + ' ' + renderInlineMarkdown(text));
      } else if (line.trim().startsWith('>')) {
        // Blockquotes
        const text = line.replace(/^>\s*/, '');
        console.log(prefix + c.dim('│ ') + c.italic(c.dim(text)));
      } else {
        // Regular text
        console.log(prefix + renderInlineMarkdown(line));
      }
    }
  }

  // ─── Progress ─────────────────────────────────────────────────────

  showProgress(message: string) {
    this.spinner.start(message);
  }

  updateProgress(message: string) {
    this.spinner.text = message;
  }

  hideProgress() {
    this.spinner.stop();
  }

  // ─── Input ────────────────────────────────────────────────────────

  async getUserInput(): Promise<string> {
    return new Promise((resolve) => {
      process.stdout.write(`  ${c.blue('▸')} `);
      this.rl.question('', (answer) => {
        resolve(answer);
      });
    });
  }

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

  // ─── Notifications ────────────────────────────────────────────────

  showSuccess(message: string) {
    this.spinner.stop();
    console.log('');
    box(message, 'success');
  }

  showInfo(message: string) {
    this.spinner.stop();
    console.log('');
    box(message, 'info');
  }

  showWarning(message: string) {
    this.spinner.stop();
    console.log('');
    box(message, 'warning');
  }

  showError(err: string) {
    this.spinner.stop();
    console.log('');
    box(err, 'error');
  }

  // ─── Stats ────────────────────────────────────────────────────────

  showStats(stats: {
    tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    duration?: number;
    toolCalls?: number;
  }) {
    const parts: string[] = [];

    if (stats.inputTokens !== undefined && stats.outputTokens !== undefined) {
      parts.push(`${c.dim('tokens:')} ${c.cyan(String(stats.inputTokens + stats.outputTokens))}`);
      parts.push(`${c.dim('in:')} ${stats.inputTokens}`);
      parts.push(`${c.dim('out:')} ${stats.outputTokens}`);
    } else if (stats.tokens !== undefined) {
      parts.push(`${c.dim('tokens:')} ${c.cyan(String(stats.tokens))}`);
    }

    if (stats.duration !== undefined) {
      const sec = (stats.duration / 1000).toFixed(1);
      parts.push(`${c.dim('time:')} ${c.green(sec + 's')}`);
    }

    if (stats.toolCalls !== undefined && stats.toolCalls > 0) {
      parts.push(`${c.dim('tools:')} ${c.magenta(String(stats.toolCalls))}`);
    }

    if (parts.length > 0) {
      console.log('');
      console.log('  ' + parts.join(c.dim(' │ ')));
    }
  }

  // ─── Help ─────────────────────────────────────────────────────────

  showHelp() {
    console.log('');
    console.log(c.bold('  Commands'));
    console.log('');
    console.log(`  ${c.cyan('/help')}        ${c.dim('Show this help message')}`);
    console.log(`  ${c.cyan('/save')}        ${c.dim('Save current session')}`);
    console.log(`  ${c.cyan('/export')}      ${c.dim('Export session as markdown')}`);
    console.log(`  ${c.cyan('/clear')}       ${c.dim('Clear conversation history')}`);
    console.log(`  ${c.cyan('/model')}       ${c.dim('Switch AI model')}`);
    console.log(`  ${c.cyan('/config')}      ${c.dim('Show configuration')}`);
    console.log(`  ${c.cyan('/exit')}        ${c.dim('Exit CodeYang')}`);
    console.log('');
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  close() {
    this.spinner.stop();
    this.rl.close();
  }
}
