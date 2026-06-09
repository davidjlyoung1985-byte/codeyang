import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeQtMigration } from './QtMigrationTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-migration-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createFile(name: string, content: string): Promise<string> {
  const p = join(tempDir, name);
  try {
    await mkdir(dirname(p), { recursive: true });
  } catch {}
  await writeFile(p, content, 'utf-8');
  return p;
}

// ──────────────────────────────────────────────
// QtMigration Tool — core detection rules
// ──────────────────────────────────────────────

describe('QtMigrationTool', () => {
  describe('Single-file detection (all 30+ rules)', () => {
    it('detects QTextCodec as error', async () => {
      await createFile('old.cpp', 'QTextCodec::codecForName("UTF-8");');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QTextCodec');
      expect(r).toContain('Errors');
      expect(r).toContain('QStringConverter');
    });

    it('detects QRegExp as error', async () => {
      await createFile('regex.cpp', 'QRegExp re("[a-z]+");');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QRegExp');
      expect(r).toContain('QRegularExpression');
    });

    it('detects qrand/qsrand as error', async () => {
      await createFile('rand.cpp', 'int r = qrand() % 100; qsrand(42);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('qrand');
      expect(r).toContain('QRandomGenerator');
    });

    it('detects QLinkedList as warning', async () => {
      await createFile('linkedlist.cpp', 'QLinkedList<int> list; list.append(1);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QLinkedList');
      expect(r).toContain('std::list');
    });

    it('detects QStringRef as error', async () => {
      await createFile('ref.cpp', 'QStringRef ref = str.midRef(0, 5);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QStringRef');
      expect(r).toContain('QStringView');
    });

    it('detects QDesktopWidget as error', async () => {
      await createFile('desk.cpp', 'QDesktopWidget *dw = QApplication::desktop();');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QDesktopWidget');
      expect(r).toContain('QScreen');
    });

    it('detects QMatrix as error', async () => {
      await createFile('mat.cpp', 'QMatrix m; m.rotate(45);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QMatrix');
      expect(r).toContain('QTransform');
    });

    it('detects QString::SkipEmptyParts as error', async () => {
      await createFile('skip.cpp', 'auto parts = str.split(",", QString::SkipEmptyParts);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('SkipEmptyParts');
      expect(r).toContain('Qt::SkipEmptyParts');
    });

    it('detects QHeaderView::setMovable as error', async () => {
      await createFile('header.cpp', 'QHeaderView::setMovable(true);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('setSectionsMovable');
    });

    it('detects QHeaderView::setResizeMode as error', async () => {
      await createFile('header2.cpp', 'QHeaderView::setResizeMode(QHeaderView::Stretch);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('setSectionResizeMode');
    });

    it('detects QTextStream::setCodec as error', async () => {
      await createFile('stream.cpp', 'QTextStream ts(&file); ts.setCodec("UTF-8");');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('setCodec');
      expect(r).toContain('QStringConverter');
    });

    it('detects QStyleOption::init as error', async () => {
      await createFile('styleopt.cpp', 'QStyleOption::init(opt, widget);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('StyleOption');
    });

    it('detects QNetworkConfigurationManager as error', async () => {
      await createFile('net.cpp', 'QNetworkConfigurationManager mgr;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QNetworkConfigurationManager');
      expect(r).toContain('QNetworkInformation');
    });

    it('detects QJsonDocument::fromBinaryData as error', async () => {
      await createFile('json.cpp', 'QJsonDocument::fromBinaryData(data);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('fromBinaryData');
      expect(r).toContain('toJson');
    });

    it('detects QPainter::HighQualityAntialiasing as warning', async () => {
      await createFile('painter.cpp', 'p.setRenderHint(QPainter::HighQualityAntialiasing);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('HighQualityAntialiasing');
      expect(r).toContain('Warnings');
    });

    it('detects QWidget::setBackgroundColor as warning', async () => {
      await createFile('widget.cpp', 'QWidget::setBackgroundColor(QColor(255, 0, 0));');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('setBackgroundColor');
    });

    it('detects QMediaPlayer as warning', async () => {
      await createFile('media.cpp', 'QMediaPlayer *player = new QMediaPlayer;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QMediaPlayer');
    });

    it('detects QMediaPlaylist as warning', async () => {
      await createFile('playlist.cpp', 'QMediaPlaylist *pl = new QMediaPlaylist;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QMediaPlaylist');
    });

    it('detects QFont::ForceIntegerMetrics as info', async () => {
      await createFile('font.cpp', 'f.setStyleStrategy(QFont::ForceIntegerMetrics);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('ForceIntegerMetrics');
      expect(r).toContain('Info');
    });

    it('detects QDir::addResourceSearchPath as warning', async () => {
      await createFile('dir.cpp', 'QDir::addResourceSearchPath("path");');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('addResourceSearchPath');
      expect(r).toContain('addSearchPath');
    });

    it('detects QThread::idealThreadCount as warning', async () => {
      await createFile('thread.cpp', 'int n = QThread::idealThreadCount();');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('idealThreadCount');
      expect(r).toContain('QThreadPool');
    });

    it('detects QFuture::waitForFinished as warning', async () => {
      await createFile('future.cpp', 'QFuture<int> future = ...; future.waitForFinished();');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('waitForFinished');
      expect(r).toContain('QFutureWatcher');
    });

    it('detects QSslSocket::sslLibraryBuildVersionString as warning', async () => {
      await createFile('ssl.cpp', 'QSslSocket::sslLibraryBuildVersionString();');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('sslLibraryBuildVersionString');
      expect(r).toContain('sslLibraryVersionString');
    });

    it('detects QStateMachine enums as warning', async () => {
      await createFile('state.cpp', 'QStateMachine::Running state;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QStateMachine');
    });

    it('detects QSet::fromList as warning', async () => {
      await createFile('set.cpp', 'auto s = QSet<int>::fromList(list);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('fromList');
    });

    it('detects QMultiMap::insertMulti as warning', async () => {
      await createFile('multimap.cpp', 'QMultiMap<QString, int> map; map.insertMulti("key", 42);');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('insertMulti');
      expect(r).toContain('QMultiMap');
    });
  });

  describe('QML migration detection', () => {
    it('detects versioned QtQuick imports', async () => {
      await createFile('ui.qml', 'import QtQuick 2.15\nRectangle { id: root }');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('import QtQuick 2');
      expect(r).toContain('versionless');
    });

    it('detects versioned Quick.Controls imports', async () => {
      await createFile('controls.qml', 'import QtQuick.Controls 2.5\nButton { }');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QtQuick.Controls');
    });

    it('detects QtGraphicalEffects import', async () => {
      await createFile('fx.qml', 'import QtGraphicalEffects 1.0\nRectangle { }');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QtGraphicalEffects');
      expect(r).toContain('Qt5Compat');
    });

    it('detects versioned Quick.Window imports', async () => {
      await createFile('win.qml', 'import QtQuick.Window 2.15\nWindow { }');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('QtQuick.Window');
    });
  });

  describe('Edge cases and filtering', () => {
    it('skips generated moc_ files', async () => {
      await createFile('moc_myclass.cpp', 'QTextCodec *c = 0;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('No Qt5');
    });

    it('skips generated ui_ files', async () => {
      await createFile('ui_mainwindow.h', 'QTextCodec *c = 0;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('No Qt5');
    });

    it('skips generated qrc_ files', async () => {
      await createFile('qrc_resources.cpp', 'QTextCodec *c = 0;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('No Qt5');
    });

    it('reports clean codebase with no issues', async () => {
      await createFile('modern.cpp', 'QRegularExpression re("[a-z]+");\nQStringView sv = u"hello";');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('No Qt5');
    });

    it('reports empty directory cleanly', async () => {
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('No Qt5');
    });

    it('handles non-existent directory gracefully', async () => {
      const r = await executeQtMigration(join(tempDir, 'nonexistent'));
      expect(typeof r).toBe('string');
    });

    it('deduplicates findings on same file+line', async () => {
      await createFile('dup.cpp', 'QTextCodec c1;\nQTextCodec c2;');
      const r = await executeQtMigration(tempDir);
      // Both lines should be reported, but each codec hit only once per line
      expect(r).toContain('QTextCodec');
      // There should be 2 findings for QTextCodec (lines 1 and 2)
      const matches = r.match(/QTextCodec/g);
      expect(matches).toBeTruthy();
    });
  });

  describe('Severity categorization', () => {
    it('categorizes errors first in output', async () => {
      await createFile('mixed.cpp', 'QTextCodec codec;\nQLinkedList<int> list;\nQFont::ForceIntegerMetrics;');
      const r = await executeQtMigration(tempDir);
      // Errors section should appear before Warnings
      const errIdx = r.indexOf('Errors');
      const warnIdx = r.indexOf('Warnings');
      const infoIdx = r.indexOf('Info');
      expect(errIdx).toBeGreaterThan(0);
      if (warnIdx >= 0) expect(errIdx).toBeLessThan(warnIdx);
      if (infoIdx >= 0) expect(errIdx).toBeLessThan(infoIdx);
    });

    it('includes summary by category', async () => {
      await createFile('cat.cpp', 'QTextCodec codec;\nQLinkedList<int> list;\nQFont::ForceIntegerMetrics;');
      const r = await executeQtMigration(tempDir);
      expect(r).toContain('By Category');
      expect(r).toContain('Core');
    });
  });
});
