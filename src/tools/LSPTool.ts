/**
 * LSPTool — Language Server Protocol integration for code intelligence.
 *
 * Provides:
 * - Go to definition
 * - Find references
 * - Hover information
 * - Document symbols
 * - Code diagnostics
 *
 * Uses the file-based analysis from queryEngine as fallback when no LSP server is available.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractSymbols, searchContent } from '../utils/queryEngine.js';

type LspAction = 'definition' | 'references' | 'hover' | 'symbols' | 'diagnostics';

export async function executeLsp(
  action: LspAction,
  filePath: string,
  line?: number,
  symbol?: string,
): Promise<string> {
  const root = process.cwd();

  switch (action) {
    case 'symbols': {
      const symbols = await extractSymbols(root, filePath);
      if (symbols.length === 0) return `No symbols found in ${filePath}`;

      const lines: string[] = [`Symbols in ${filePath}:`, ''];
      for (const s of symbols) {
        lines.push(`  ${s.kind.padEnd(12)} ${s.name}  (line ${s.line})`);
      }
      return lines.join('\n');
    }

    case 'definition': {
      if (!symbol) return 'Error: symbol name required for definition lookup';
      // Search for definition patterns across the project
      const patterns = [
        `function ${symbol}`,
        `class ${symbol}`,
        `interface ${symbol}`,
        `type ${symbol}`,
        `const ${symbol}`,
        `let ${symbol}`,
        `var ${symbol}`,
      ];
      const results: Array<{ file: string; line: number; content: string }> = [];
      for (const pattern of patterns) {
        const matches = await searchContent(root, pattern, '*.ts');
        for (const m of matches) {
          if (!results.find((r) => r.file === m.file && r.line === m.line)) {
            results.push(m);
          }
        }
        if (results.length >= 5) break;
      }

      if (results.length === 0) return `Definition not found for: ${symbol}`;
      const lines: string[] = [`Definitions for "${symbol}":`, ''];
      for (const r of results) {
        lines.push(`  ${r.file}:${r.line}  ${r.content.slice(0, 100)}`);
      }
      return lines.join('\n');
    }

    case 'references': {
      if (!symbol) return 'Error: symbol name required for reference search';
      const results = await searchContent(root, symbol, '*.ts');
      if (results.length === 0) return `No references found for: ${symbol}`;

      const lines = [`References for "${symbol}" (${results.length}):`, ''];
      for (let i = 0; i < Math.min(results.length, 30); i++) {
        const r = results[i];
        lines.push(`  ${r.file}:${r.line}  ${r.content.slice(0, 120)}`);
      }
      if (results.length > 30) lines.push(`  ... and ${results.length - 30} more`);
      return lines.join('\n');
    }

    case 'hover': {
      if (!symbol) return 'Error: symbol name required for hover info';
      const results = await searchContent(root, symbol, '*.ts');
      if (results.length === 0) return `No information found for: ${symbol}`;

      // Show first occurrence with surrounding context
      const first = results[0];
      const content = readFileContent(join(root, first.file));
      if (!content) return `Cannot read: ${first.file}`;

      const lines = content.split('\n');
      const start = Math.max(0, first.line - 3);
      const end = Math.min(lines.length, first.line + 2);
      const ctx = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');

      return `Symbol: ${symbol}\nFile: ${first.file}\nNear line: ${first.line}\n\nContext:\n${ctx}`;
    }

    case 'diagnostics': {
      // Simple diagnostics: check for common issues via regex
      const content = readFileContent(join(root, filePath));
      if (!content) return `Cannot read: ${filePath}`;

      const issues: string[] = [];
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('console.log')) {
          issues.push(`Line ${i + 1}: console.log left in code`);
        }
        if (line.match(/TODO|FIXME|HACK/i)) {
          issues.push(`Line ${i + 1}: ${line.match(/TODO|FIXME|HACK/i)![0]} comment`);
        }
        if (line.length > 200) {
          issues.push(`Line ${i + 1}: Line too long (${line.length} chars > 200)`);
        }
        if (line.match(/^\s*any\s*[:=]/)) {
          issues.push(`Line ${i + 1}: 'any' type used`);
        }
      }

      if (issues.length === 0) return `No issues found in ${filePath}`;
      return [`Diagnostics for ${filePath}:`, ...issues.map((i) => `  ⚠ ${i}`)].join('\n');
    }

    default:
      return `Unknown LSP action: ${action}`;
  }
}

function readFileContent(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
