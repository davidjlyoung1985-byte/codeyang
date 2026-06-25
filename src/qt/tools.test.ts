import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeQtMigration } from './tools/QtMigrationTool.js';
import { executeQtUi } from './tools/QtUiTool.js';
import { executeQtQml } from './tools/QtQmlTool.js';
import { executeQtSignals } from './tools/QtSignalsTool.js';
import { executeQtProFile } from './tools/QtProFileTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-qtt-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createFile(name: string, content: string): Promise<string> {
  const p = join(tempDir, name);
  const d = join(tempDir, name).split('/').slice(0, -1).join('/');
  try {
    await mkdir(d, { recursive: true });
  } catch {
    // Directory may already exist - ignore
  }
  await writeFile(p, content, 'utf-8');
  return p;
}

// ──────────────────────────────────────────────
// QtMigration (25+ rules)
// ──────────────────────────────────────────────

describe('QtMigration direct', () => {
  it('detects QTextCodec as error', async () => {
    await createFile('old.cpp', 'QTextCodec::codecForName("UTF-8");');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('QTextCodec');
    expect(r).toContain('Errors');
  });

  it('detects QRegExp as error', async () => {
    await createFile('reg.cpp', 'QRegExp re("[a-z]+");');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('QRegExp');
  });

  it('detects QStringRef as error', async () => {
    await createFile('ref.cpp', 'QStringRef ref = str.midRef(0, 5);');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('QStringRef');
  });

  it('detects QDesktopWidget', async () => {
    await createFile('desk.cpp', 'QDesktopWidget *dw = QApplication::desktop();');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('QDesktopWidget');
  });

  it('detects QMatrix', async () => {
    await createFile('mat.cpp', 'QMatrix m; m.rotate(45);');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('QMatrix');
  });

  it('detects qrand/qsrand', async () => {
    await createFile('rng.cpp', 'int x = qrand() % 100;');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('qrand');
  });

  it('detects QHeaderView migration rule', async () => {
    await createFile('header.cpp', 'QHeaderView h; h.setMovable(true);');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('setMovable');
  });

  it('detects QTextStream::setCodec', async () => {
    await createFile('ts.cpp', 'QTextStream ts(&file); ts.setCodec("UTF-8");');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('setCodec');
  });

  it('detects QLinkedList', async () => {
    await createFile('ll.cpp', 'QLinkedList<int> list;');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('QLinkedList');
  });

  it('detects QML versioned imports', async () => {
    await createFile('ui.qml', 'import QtQuick 2.15\nRectangle { id: root }');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('import');
  });

  it('skips generated moc files', async () => {
    await createFile('moc_myclass.cpp', 'QTextCodec *c = 0;');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('No Qt5');
  });

  it('reports empty codebase cleanly', async () => {
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('No Qt5');
  });

  it('detects QML QtGraphicalEffects', async () => {
    await createFile('fx.qml', 'import QtGraphicalEffects 1.15');
    const r = await executeQtMigration(tempDir);
    expect(r).toContain('GraphicalEffects');
  });
});

// ──────────────────────────────────────────────
// QtUi (.ui file parser)
// ──────────────────────────────────────────────

describe('QtUi direct', () => {
  it('parses widget count from .ui file', async () => {
    await createFile(
      'main.ui',
      `<?xml version="1.0"?>
<ui version="4.0">
 <class>MainWindow</class>
 <widget class="QMainWindow" name="MainWindow">
  <widget class="QWidget" name="centralWidget">
   <widget class="QPushButton" name="btn1"/>
   <widget class="QLabel" name="label1"/>
  </widget>
 </widget>
</ui>`,
    );
    const r = await executeQtUi(undefined, tempDir);
    expect(r).toContain('widgets');
    expect(r).not.toContain('No .ui files');
  });

  it('parses connections in .ui', async () => {
    await createFile(
      'dlg.ui',
      `<?xml version="1.0"?>
<ui version="4.0">
 <class>Dialog</class>
 <widget class="QDialog" name="Dialog">
  <widget class="QPushButton" name="okBtn"/>
 </widget>
 <connections>
  <connection>
   <sender>okBtn</sender>
   <signal>clicked()</signal>
   <receiver>Dialog</receiver>
   <slot>accept()</slot>
  </connection>
 </connections>
</ui>`,
    );
    const r = await executeQtUi(undefined, tempDir);
    expect(r).toContain('Connections:');
    expect(r).toContain('okBtn');
    expect(r).toContain('clicked');
    expect(r).toContain('accept');
  });

  it('handles no .ui files gracefully', async () => {
    const r = await executeQtUi(undefined, tempDir);
    expect(r).toContain('No .ui files');
  });
});

// ──────────────────────────────────────────────
// QtQml
// ──────────────────────────────────────────────

describe('QtQml direct', () => {
  it('detects versioned QtQuick import', async () => {
    await createFile(
      'app.qml',
      'import QtQuick 2.15\nimport QtQuick.Controls 2.5\n\nRectangle { width: 100; height: 100 }',
    );
    const r = await executeQtQml(tempDir);
    expect(r).toContain('QML');
  });

  it('detects deprecated QtGraphicalEffects', async () => {
    await createFile('fx2.qml', 'import QtGraphicalEffects 1.0\nRectangle { }');
    const r = await executeQtQml(tempDir);
    expect(r).toContain('QtGraphicalEffects');
  });

  it('reports empty QML directory', async () => {
    const r = await executeQtQml(tempDir);
    expect(r).toContain('No QML files');
  });
});

// ──────────────────────────────────────────────
// QtSignals
// ──────────────────────────────────────────────

describe('QtSignals direct', () => {
  it('finds new-style connect() calls', async () => {
    await createFile(
      'conn.cpp',
      '#include <QObject>\n' +
        'void setup(QObject *a, QObject *b) {\n' +
        '    QObject::connect(a, &MyClass::valueChanged, b, &MyClass::onValueChanged);\n' +
        '}',
    );
    const r = await executeQtSignals(tempDir);
    expect(r).toContain('New-Style');
    expect(r).toContain('valueChanged');
  });

  it('finds old-style SIGNAL/SLOT macros', async () => {
    await createFile(
      'oldconn.cpp',
      '#include <QObject>\n' +
        'void setup(QObject *a, QObject *b) {\n' +
        '    connect(a, SIGNAL(ready), b, SLOT(handleReady));\n' +
        '}',
    );
    const r = await executeQtSignals(tempDir);
    expect(r).toContain('Old-Style');
    expect(r).toContain('ready');
  });

  it('handles empty project', async () => {
    const r = await executeQtSignals(tempDir);
    expect(r).toContain('No signal-slot connections');
  });
});

// ──────────────────────────────────────────────
// QtProFile
// ──────────────────────────────────────────────

describe('QtProFile direct', () => {
  it('parses QT modules from .pro', async () => {
    await createFile(
      'test.pro',
      'QT += core gui widgets\n' +
        'TEMPLATE = app\n' +
        'TARGET = myapp\n' +
        'SOURCES += main.cpp widget.cpp\n' +
        'HEADERS += widget.h\n',
    );
    const r = await executeQtProFile(join(tempDir, 'test.pro'), tempDir);
    expect(r).toContain('core');
    expect(r).toContain('gui');
    expect(r).toContain('widgets');
    expect(r).toContain('SOURCES');
    expect(r).toContain('HEADERS');
  });

  it('auto-discovers .pro file', async () => {
    await createFile('autodisc.pro', 'QT += core\nTEMPLATE = app');
    const r = await executeQtProFile(undefined, tempDir);
    expect(r).toContain('core');
    expect(r).not.toContain('No .pro file');
  });

  it('reports missing .pro gracefully', async () => {
    const r = await executeQtProFile(undefined, tempDir);
    expect(r).toContain('No .pro file');
  });
});
