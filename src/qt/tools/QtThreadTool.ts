/**
 * QtThread — Analyze threading/concurrency code for safety issues.
 * Detects: GUI calls from non-GUI threads, missing mutex protection,
 * direct QThread subclassing anti-pattern, blocking in GUI thread, etc.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

interface ThreadIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export async function executeQtThread(cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const files = await collectSourceFiles(base);
  const issues: ThreadIssue[] = [];

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const rel = relative(base, file).replace(/\\/g, '/');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i], ln = i + 1;

        // Direct QThread subclassing (anti-pattern: prefer moveToThread)
        if (/class\s+\w+.*:\s*public\s+QThread\b/.test(line)) {
          issues.push({
            file: rel, line: ln, severity: 'warning',
            message: 'Direct QThread subclass detected. Prefer worker-object pattern: create QObject, moveToThread(). Only subclass QThread if you need to customize thread event loop behavior.',
          });
        }

        // Blocking wait in GUI thread
        if (/(?:waitForReadyRead|waitForConnected|waitForBytesWritten|waitForDisconnected)\s*\(/.test(line)) {
          issues.push({
            file: rel, line: ln, severity: 'error',
            message: 'Blocking wait method detected — this will freeze the GUI. Use async signals (readyRead, connected, finished) instead.',
          });
        }

        // QMutex::lock() without unlock() or QMutexLocker
        if (/\.lock\s*\(\s*\)/.test(line)) {
          const body = content.slice(i * 100);
          if (!/\.unlock\s*\(/.test(body.slice(0, 500)) && !/QMutexLocker/.test(body.slice(0, 500))) {
            issues.push({
              file: rel, line: ln, severity: 'warning',
              message: 'QMutex::lock() without matching unlock() nearby. Use QMutexLocker for RAII-style auto-unlock.',
            });
          }
        }

        // processEvents() in worker code (anti-pattern)
        if (/processEvents\s*\(/.test(line) && !content.includes('paintEvent')) {
          issues.push({
            file: rel, line: ln, severity: 'warning',
            message: 'QCoreApplication::processEvents() in non-GUI code. This is usually a workaround for a design issue. Fix the underlying async pattern instead.',
          });
        }

        // setWidget / show / exec in non-GUI context
        if (/\.(?:setWidget|show|exec|setVisible|update|repaint)\s*\(/.test(line)) {
          // Check if this file is likely a worker thread (has run() or moveToThread)
          if (/void\s+run\s*\(/.test(content)) {
            issues.push({
              file: rel, line: ln, severity: 'error',
              message: 'GUI operation called from QThread::run(). GUI methods must be called from the main thread. Use QMetaObject::invokeMethod() with Qt::QueuedConnection.',
            });
          }
        }

        // deleteLater() vs direct delete in thread context
        if (/delete\s+\w+\s*;/.test(line) && !/deleteLater/.test(line)) {
          const ctx = content.slice(Math.max(0, i - 5) * 100, i * 100 + 200);
          if (/\bQThread\b|run\s*\(|moveToThread/.test(ctx)) {
            issues.push({
              file: rel, line: ln, severity: 'info',
              message: 'Direct delete in thread context. Consider using deleteLater() for QObjects with event loop affinity.',
            });
          }
        }

        // QFuture without watcher (fire-and-forget, may miss errors)
        if (/QtConcurrent::run\s*\(/.test(line)) {
          const surrounding = content.slice(i * 100, i * 100 + 200);
          if (!/QFutureWatcher|\.then\s*\(|\.onFailed|\.isFinished/.test(surrounding)) {
            issues.push({
              file: rel, line: ln, severity: 'info',
              message: 'QtConcurrent::run() without error handling. Attach QFutureWatcher or use .then()/.onFailed() to handle results and errors.',
            });
          }
        }

        // QReadWriteLock: lockForWrite without unlock
        if (/lockForWrite\s*\(/.test(line) && !content.slice(i * 100, i * 100 + 300).includes('unlock')) {
          issues.push({
            file: rel, line: ln, severity: 'warning',
            message: 'lockForWrite() without unlock() — may deadlock. Use QReadLocker/QWriteLocker for RAII.',
          });
        }
      }
    } catch { /* skip */ }
  }

  return formatThreadReport(issues);
}

function formatThreadReport(issues: ThreadIssue[]): string {
  const lines: string[] = [];
  lines.push('## Qt Threading Analysis\n');

  if (issues.length === 0) {
    lines.push('No threading issues found.');
    return lines.join('\n');
  }

  for (const sev of ['error', 'warning', 'info'] as const) {
    const items = issues.filter((i) => i.severity === sev);
    if (items.length === 0) continue;
    const label = sev === 'error' ? 'Critical' : sev === 'warning' ? 'Warnings' : 'Info';
    lines.push(`### ${label} (${items.length})`);
    for (const item of items) {
      lines.push(`  - \`${item.file}:${item.line}\` — ${item.message}`);
    }
    lines.push('');
  }

  lines.push('### Threading Best Practices');
  lines.push('- Worker-object pattern: create QObject → moveToThread() → connect signals to trigger work');
  lines.push('- NEVER touch GUI from non-GUI threads. Use QMetaObject::invokeMethod(Qt::QueuedConnection).');
  lines.push('- Use QMutexLocker / QReadLocker for RAII lock management.');
  lines.push('- Use QtConcurrent for simple parallel tasks; QThread for long-running loops.');
  lines.push('- Avoid waitFor*() in the main thread — use async signals instead.');

  return lines.join('\n');
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'build', 'dist', '3rdparty']);
  async function walk(d: string) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skip.has(entry.name)) await walk(full);
      } else if (entry.isFile() && ['.cpp', '.h', '.hpp'].includes(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}
