/**
 * QtGraphics — Analyze QPainter, QGraphicsView, and rendering code.
 * Detects anti-patterns, performance issues, and rendering correctness problems.
 */
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { collectFiles } from '../shared.js';

interface GraphicsIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  snippet: string;
}

export async function executeQtGraphics(cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const files = await collectSourceFiles(base);
  const issues: GraphicsIssue[] = [];

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      issues.push(...analyzeGraphicsCode(file, content, base));
    } catch {
      /* skip */
    }
  }

  return formatGraphicsReport(issues, base);
}

// ─── Analysis Rules ──────────────────────────────────────────────────────────

function analyzeGraphicsCode(filePath: string, content: string, base: string): GraphicsIssue[] {
  const relPath = relative(base, filePath).replace(/\\/g, '/');
  const lines = content.split('\n');
  const issues: GraphicsIssue[] = [];
  let insidePainter = false;
  let painterLineStart = 0;
  let hasSaveRestore = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    // ─── QPainter analysis ────────────────────────────────────────────────

    // Detect QPainter begin without matching save/restore
    if (/QPainter\s+p(?:ainter)?\s*\(/.test(line)) {
      insidePainter = true;
      painterLineStart = ln;
      hasSaveRestore = false;
    }
    if (/p(?:ainter)?\.end\s*\(\)/.test(line)) {
      if (insidePainter && !hasSaveRestore) {
        // Check for state changes between begin and end
        const body = lines.slice(painterLineStart - 1, i).join('\n');
        if (
          /(?:setPen|setBrush|setFont|setTransform|translate|rotate|scale|setClipPath|setClipRect|setOpacity|setCompositionMode)\s*\(/.test(
            body,
          )
        ) {
          issues.push({
            file: relPath,
            line: painterLineStart,
            severity: 'warning',
            category: 'QPainter',
            message:
              'State changes without save()/restore() may affect subsequent painting. Wrap in painter.save()/painter.restore().',
            snippet: lines[painterLineStart - 1].trim().slice(0, 100),
          });
        }
      }
      insidePainter = false;
    }
    if (/p(?:ainter)?\.save\s*\(\)/.test(line)) hasSaveRestore = true;

    // ─── Anti-aliasing missing for text ───────────────────────────────────
    if (/p(?:ainter)?\.draw(?:Text|StaticText)\s*\(/.test(line)) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'info',
        category: 'QPainter',
        message:
          'Text rendered without Antialiasing hint. Call painter.setRenderHint(QPainter::Antialiasing) or QPainter::TextAntialiasing for better rendering.',
        snippet: line.trim().slice(0, 100),
      });
    }

    // ─── QPixmap in paintEvent (slow) ─────────────────────────────────────
    if (/\bQPixmap\b/.test(line) && isInsidePaintEvent(lines, i)) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'warning',
        category: 'Performance',
        message: 'QPixmap created inside paintEvent(). Move to member variable and update only when needed.',
        snippet: line.trim().slice(0, 100),
      });
    }

    // ─── Direct drawImage without caching ─────────────────────────────────
    if (/p(?:ainter)?\.drawImage\s*\(.*QImage\s*\(/.test(line)) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'warning',
        category: 'Performance',
        message: 'QImage constructed inline in drawImage(). Load and cache the image outside the paint loop.',
        snippet: line.trim().slice(0, 100),
      });
    }

    // ─── QGraphicsScene clear() with many items ───────────────────────────
    if (/scene.*->\s*clear\s*\(\)/.test(line)) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'warning',
        category: 'QGraphicsView',
        message:
          'QGraphicsScene::clear() deletes all items synchronously. For many items, consider removeItem() followed by deleteLater().',
        snippet: line.trim().slice(0, 100),
      });
    }

    // ─── QGraphicsItem without caching ────────────────────────────────────
    if (
      /class\s+\w+.*:\s*public\s+QGraphics\w+/.test(line) &&
      !content.slice(i, i + 20).includes('DeviceCoordinateCache')
    ) {
      if (
        content.slice(i - 100, i + 500).includes('paint(') &&
        !content.slice(i - 100, i + 500).includes('setCacheMode')
      ) {
        issues.push({
          file: relPath,
          line: ln,
          severity: 'info',
          category: 'QGraphicsView',
          message:
            'QGraphicsItem with custom paint() but no cache mode set. Add setCacheMode(DeviceCoordinateCache) for static items.',
          snippet: line.trim().slice(0, 100),
        });
      }
    }

    // ─── Painter not ended ────────────────────────────────────────────────
    if (/p(?:ainter)?\.begin\s*\(/.test(line)) {
      const hasEnd = content.slice(i).includes('.end()');
      if (!hasEnd) {
        issues.push({
          file: relPath,
          line: ln,
          severity: 'error',
          category: 'QPainter',
          message: 'QPainter::begin() without matching end(). The painter must be properly ended to release resources.',
          snippet: line.trim().slice(0, 100),
        });
      }
    }

    // ─── Direct QWidget::paintEvent without QStylePainter ─────────────────
    if (
      line.includes('paintEvent') &&
      line.includes('QWidget') &&
      !content.slice(i, i + 500).includes('QStylePainter')
    ) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'info',
        category: 'QPainter',
        message:
          'Custom paintEvent without QStylePainter. Use QStylePainter for proper style integration, or QPainter for fully custom drawing.',
        snippet: line.trim().slice(0, 100),
      });
    }

    // ─── setPen/setBrush with QColor() temporary ──────────────────────────
    if (/p(?:ainter)?\.(?:setPen|setBrush)\s*\(\s*Q(?:Pen|Brush)\s*\(\s*QColor\s*\(/.test(line)) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'info',
        category: 'Performance',
        message: 'Temporary QPen/QBrush created inline. Store frequently-used pens/brushes as member variables.',
        snippet: line.trim().slice(0, 100),
      });
    }

    // ─── QPixmap::grabWidget() removed in Qt6 ─────────────────────────────
    if (/\bQPixmap::grabWidget\b|\.grabWidget\s*\(/.test(line)) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'error',
        category: 'Migration',
        message: 'QPixmap::grabWidget() removed in Qt6. Use QWidget::grab() instead.',
        snippet: line.trim().slice(0, 100),
      });
    }

    // ─── update() called inside paintEvent ────────────────────────────────
    if (isInsidePaintEvent(lines, i) && /\bupdate\s*\(/.test(line)) {
      issues.push({
        file: relPath,
        line: ln,
        severity: 'error',
        category: 'QPainter',
        message: 'update() called inside paintEvent() — this creates an infinite paint loop. Remove it.',
        snippet: line.trim().slice(0, 100),
      });
    }
  }

  return issues;
}

function isInsidePaintEvent(lines: string[], currentLine: number): boolean {
  // Look backwards up to 50 lines for a paintEvent declaration
  const start = Math.max(0, currentLine - 50);
  for (let i = currentLine; i >= start; i--) {
    if (/void\s+\w+::paintEvent\s*\(/.test(lines[i])) return true;
    if (/\{$/.test(lines[i].trim()) && !lines[i].includes('paintEvent')) {
      // We hit a different function body — not inside paintEvent
      break;
    }
  }
  return false;
}

// ─── File Collection ─────────────────────────────────────────────────────────

async function collectSourceFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: new Set(['.cpp', '.h', '.hpp', '.cxx']) });
}

// ─── Report Formatting ───────────────────────────────────────────────────────

function formatGraphicsReport(issues: GraphicsIssue[], _base: string): string {
  const lines: string[] = [];
  lines.push('## Qt Graphics Code Analysis\n');

  if (issues.length === 0) {
    lines.push('No graphics issues found.');
    return lines.join('\n');
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  // Group by category
  const categories = [...new Set(issues.map((i) => i.category))];
  for (const cat of categories) {
    const catIssues = issues.filter((i) => i.category === cat);
    lines.push(`### ${cat} (${catIssues.length})\n`);

    for (const issue of catIssues) {
      lines.push(`  - \`${issue.file}:${issue.line}\` — ${issue.message}`);
    }
    lines.push('');
  }

  lines.push(`### Summary`);
  lines.push(`- ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info items`);

  if (errors.length > 0) {
    lines.push('\n> :exclamation: Errors must be fixed before deployment.');
  }

  return lines.join('\n');
}
