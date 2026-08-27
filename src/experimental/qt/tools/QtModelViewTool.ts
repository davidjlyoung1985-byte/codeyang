/**
 * QtModelView — Analyze Model/View architecture patterns and detect anti-patterns.
 */
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { collectFiles } from '../shared.js';

interface MVIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}
export async function executeQtModelView(cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const files = await collectCppFiles(base);
  const issues: MVIssue[] = [];
  let modelCount = 0,
    viewCount = 0,
    delegateCount = 0,
    proxyCount = 0;

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const rel = relative(base, file).replace(/\\/g, '/');
      const lines = content.split('\n');

      // Count model implementations
      if (/class\s+\w+.*:\s*public\s+QAbstract\w*Model/.test(content)) modelCount++;
      if (/class\s+\w+.*:\s*public\s+Q\w*View/.test(content)) viewCount++;
      if (/class\s+\w+.*:\s*public\s+Q\w*Delegate/.test(content)) delegateCount++;
      if (/class\s+\w+.*:\s*public\s+QSortFilterProxyModel/.test(content)) proxyCount++;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i],
          ln = i + 1;

        // beginInsertRows without endInsertRows
        if (/beginInsertRows\s*\(/.test(line)) {
          const remaining = content.slice(lines.slice(0, i).join('\n').length);
          if (!remaining.includes('endInsertRows')) {
            issues.push({
              file: rel,
              line: ln,
              severity: 'error',
              message: 'beginInsertRows() without matching endInsertRows() — views will crash.',
            });
          }
        }

        // beginResetModel in a loop (expensive)
        if (/beginResetModel/.test(line)) {
          issues.push({
            file: rel,
            line: ln,
            severity: 'warning',
            message:
              'beginResetModel() is expensive. For single-row changes, use beginInsertRows/beginRemoveRows instead.',
          });
        }

        // setModel() on a view that already has a model without disconnect
        if (/setModel\s*\(/.test(line) && content.slice(i).includes('setModel(')) {
          const prev = content.slice(0, content.indexOf(line) + line.length).match(/setModel\s*\(/g);
          if (prev && prev.length > 1) {
            issues.push({
              file: rel,
              line: ln,
              severity: 'warning',
              message: 'Multiple setModel() calls. Disconnect old model first or reuse the same model.',
            });
          }
        }

        // Tree model: missing parent() implementation
        if (/QAbstractItemModel/.test(content) && !/::parent\s*\(/.test(content)) {
          if (content.includes('QAbstractItemModel') && !issues.some((x) => x.message.includes('parent()'))) {
            issues.push({
              file: rel,
              line: 1,
              severity: 'error',
              message:
                'QAbstractItemModel subclass must implement parent() — required for tree models and view navigation.',
            });
          }
        }

        // index() with createIndex in every call (no caching)
        if (/return\s+createIndex\s*\(/.test(line) && !content.includes('QModelIndex')) {
          issues.push({
            file: rel,
            line: ln,
            severity: 'warning',
            message: 'createIndex() called inline — consider caching frequent indexes as member variables.',
          });
        }

        // data() with role==Qt::DisplayRole that allocates memory
        if (/role\s*==\s*Qt::DisplayRole/.test(line) && /new\s+|QString\s*\(/.test(line)) {
          issues.push({
            file: rel,
            line: ln,
            severity: 'warning',
            message:
              'data() called frequently — avoid allocations in DisplayRole handler. Return cached/const strings.',
          });
        }

        // Missing call to base data() for unhandled roles
        const dataFn = content.match(/QVariant\s+(\w+)::data\s*\(\s*const\s+QModelIndex\s*&\s*\w+\s*,\s*int\s+role/);
        if (dataFn && !content.includes('baseClass::data') && !content.includes('QAbstractItemModel::data')) {
          const hasDefault = content.indexOf('return QVariant()') > 0 || content.indexOf('return {}') > 0;
          if (!hasDefault && !issues.some((x) => x.message.includes('base class data'))) {
            issues.push({
              file: rel,
              line: 1,
              severity: 'info',
              message:
                'Custom data() should call base class data() for unhandled roles to support built-in roles (ToolTipRole, StatusTipRole, etc.).',
            });
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  return formatMVReport(issues, { modelCount, viewCount, delegateCount, proxyCount });
}

function formatMVReport(issues: MVIssue[], counts: Record<string, number>): string {
  const lines: string[] = [];
  lines.push('## Qt Model/View Architecture Analysis\n');
  lines.push(
    `Components: ${counts.modelCount} model(s), ${counts.viewCount} view(s), ${counts.delegateCount} delegate(s), ${counts.proxyCount} proxy/ies\n`,
  );

  if (issues.length === 0) {
    lines.push('No Model/View issues found. Architecture looks clean.');
    return lines.join('\n');
  }

  for (const severity of ['error', 'warning', 'info'] as const) {
    const items = issues.filter((i) => i.severity === severity);
    if (items.length === 0) continue;
    const label = severity === 'error' ? 'Errors' : severity === 'warning' ? 'Warnings' : 'Info';
    lines.push(`### ${label} (${items.length})`);
    for (const item of items) {
      lines.push(`  - \`${item.file}:${item.line}\` — ${item.message}`);
    }
    lines.push('');
  }

  lines.push('### Best Practices Quick Reference');
  lines.push('- For tables: QAbstractTableModel (columnCount + rowCount + data)');
  lines.push('- For trees: QAbstractItemModel (add index() and parent())');
  lines.push('- For lists: QAbstractListModel is sufficient');
  lines.push('- For filtering/search: QSortFilterProxyModel');
  lines.push('- For form-based editing: QDataWidgetMapper');

  return lines.join('\n');
}

async function collectCppFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: new Set(['.cpp', '.h', '.hpp']) });
}
