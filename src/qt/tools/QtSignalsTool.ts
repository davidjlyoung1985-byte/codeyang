/**
 * QtSignalsTool — Analyze signal-slot connections in a Qt project.
 * Scans .h/.cpp files for connect() calls, SIGNAL/SLOT macros, and auto-connections.
 */
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { collectFiles, SOURCE_EXTS } from '../shared.js';

interface SignalConnection {
  file: string;
  line: number;
  sender: string;
  signal: string;
  receiver: string;
  slot: string;
  syntax: 'new' | 'old'; // new-style (PMF) vs old-style (SIGNAL/SLOT macros)
  auto: boolean; // on_widgetName_signalName() auto-connection
}

const SKIP_SIGNALS = new Set(['node_modules', '.git', 'build', 'dist']);

export async function executeQtSignals(cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const files = await collectSourceFiles(base);
  const connections: SignalConnection[] = [];

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;

        // New-style connect: connect(sender, &Class::signal, receiver, &Class::slot)
        const newMatch = lines[i].match(/connect\s*\(\s*(\w+)\s*,\s*&(\w+)::(\w+)\s*,\s*(\w+)\s*,\s*&(\w+)::(\w+)/);
        if (newMatch) {
          connections.push({
            file: relative(base, file).replace(/\\/g, '/'),
            line: lineNum,
            sender: newMatch[1],
            signal: `${newMatch[2]}::${newMatch[3]}`,
            receiver: newMatch[4],
            slot: `${newMatch[5]}::${newMatch[6]}`,
            syntax: 'new',
            auto: false,
          });
        }

        // Old-style: connect(sender, SIGNAL(x()), receiver, SLOT(y()))
        const oldMatch = lines[i].match(
          /connect\s*\(\s*(\w+)\s*,\s*SIGNAL\s*\(([^)]+)\)\s*,\s*(\w+)\s*,\s*SLOT\s*\(([^)]+)\)/,
        );
        if (oldMatch) {
          connections.push({
            file: relative(base, file).replace(/\\/g, '/'),
            line: lineNum,
            sender: oldMatch[1],
            signal: oldMatch[2],
            receiver: oldMatch[3],
            slot: oldMatch[4],
            syntax: 'old',
            auto: false,
          });
        }

        // Auto-connection: void on_widgetName_signalName() in a class derived from a .ui form
        // Pattern: on_<objectName>_<signalName>()
        const autoMatch = lines[i].match(/(?:void|bool)\s+on_(\w+)_(\w+)\s*\(/);
        if (autoMatch && !lines[i].includes('//')) {
          connections.push({
            file: relative(base, file).replace(/\\/g, '/'),
            line: lineNum,
            sender: '(auto)',
            signal: autoMatch[2],
            receiver: 'this',
            slot: `on_${autoMatch[1]}_${autoMatch[2]}`,
            syntax: 'new',
            auto: true,
          });
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  if (connections.length === 0) {
    return 'No signal-slot connections found in the project.';
  }

  const lines: string[] = [];
  const oldStyle = connections.filter((c) => c.syntax === 'old');
  const newStyle = connections.filter((c) => c.syntax === 'new' && !c.auto);
  const autoConns = connections.filter((c) => c.auto);

  lines.push(`## Signal-Slot Analysis (${connections.length} connections)\n`);

  if (oldStyle.length > 0) {
    lines.push(`### Old-Style SIGNAL/SLOT (${oldStyle.length}) — consider migrating to new-style:`);
    for (const c of oldStyle) {
      lines.push(`  - ${c.file}:${c.line}: \`${c.sender}\` SIGNAL(${c.signal}) → SLOT(${c.slot}) on \`${c.receiver}\``);
    }
    lines.push('');
  }

  if (newStyle.length > 0) {
    lines.push(`### New-Style PMF (${newStyle.length}):`);
    for (const c of newStyle) {
      lines.push(`  - ${c.file}:${c.line}: \`${c.sender}\`::${c.signal} → \`${c.receiver}\`::${c.slot}`);
    }
    lines.push('');
  }

  if (autoConns.length > 0) {
    lines.push(`### Auto-Connections (${autoConns.length}) — from .ui form widgets:`);
    for (const c of autoConns) {
      lines.push(`  - ${c.file}:${c.line}: \`${c.slot}\``);
    }
  }

  // Summary
  if (oldStyle.length > 0) {
    lines.push(
      `\n### Migration Advice\n${oldStyle.length} old-style SIGNAL/SLOT connections found. These skip compile-time checks — migrate them to the type-safe \`&Class::method\` syntax.`,
    );
  }

  return lines.join('\n');
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, {
    skipDirs: SKIP_SIGNALS,
    extensions: SOURCE_EXTS,
    skipPrefixes: ['moc_', 'ui_'],
  });
}
