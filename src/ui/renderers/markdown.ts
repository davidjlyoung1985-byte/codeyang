/**
 * Markdown rendering utilities for CLI output
 */
import picocolors from 'picocolors';

const c = picocolors;

/**
 * Render inline markdown (backticks, bold, italic, links)
 */
export function renderInlineMarkdown(text: string): string {
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

/**
 * Render full markdown text with blocks
 */
export function renderMarkdown(text: string): string {
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
        result.push(c.dim(c.italic('💭 ' + thinkingLines.join(' '))));
      }
      thinkingLines = [];
      continue;
    }
    if (inThinking) {
      const cleanLine = line.trim();
      if (cleanLine) thinkingLines.push(cleanLine);
      continue;
    }

    // Handle code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        result.push(c.dim('┌' + '─'.repeat(78) + '┐'));
        for (const codeLine of codeLines) {
          result.push(c.dim('│ ') + c.cyan(codeLine.padEnd(77)) + c.dim(' │'));
        }
        result.push(c.dim('└' + '─'.repeat(78) + '┘'));
        if (codeLang) {
          result.push(c.dim(`  Language: ${codeLang}`));
        }
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      } else {
        // Start code block
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Handle headers
    if (line.startsWith('# ')) {
      result.push('');
      result.push(c.bold(c.magenta(line.slice(2))));
      result.push('');
      continue;
    }
    if (line.startsWith('## ')) {
      result.push('');
      result.push(c.bold(c.cyan(line.slice(3))));
      continue;
    }
    if (line.startsWith('### ')) {
      result.push(c.bold(line.slice(4)));
      continue;
    }

    // Handle lists
    if (line.match(/^\s*[-*+]\s/)) {
      result.push(c.dim('  •') + ' ' + renderInlineMarkdown(line.replace(/^\s*[-*+]\s/, '')));
      continue;
    }

    // Handle numbered lists
    if (line.match(/^\s*\d+\.\s/)) {
      const num = line.match(/^\s*(\d+)\./)?.[1];
      result.push(c.dim(`  ${num}.`) + ' ' + renderInlineMarkdown(line.replace(/^\s*\d+\.\s/, '')));
      continue;
    }

    // Handle blockquotes
    if (line.startsWith('> ')) {
      result.push(c.dim('│ ') + c.italic(line.slice(2)));
      continue;
    }

    // Regular text with inline markdown
    if (line.trim()) {
      result.push(renderInlineMarkdown(line));
    } else {
      result.push('');
    }
  }

  return result.join('\n');
}
