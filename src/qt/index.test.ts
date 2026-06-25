import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectQtProject, type QtContext } from './detector.js';
import { buildQtPrompt } from './prompt.js';
import { createQtTools } from './tools.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ──────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-qt-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createFile(name: string, content: string): Promise<string> {
  const path = join(tempDir, name);
  await writeFile(path, content, 'utf-8');
  return path;
}

// ──────────────────────────────────────────────
// QtDetector tests
// ──────────────────────────────────────────────

describe('detectQtProject', () => {
  it('detects qmake project from .pro file', async () => {
    await createFile('myapp.pro', 'QT += core gui widgets\nTEMPLATE = app');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.isQtProject).toBe(true);
    expect(ctx.buildSystem).toBe('qmake');
    expect(ctx.proFile).toContain('myapp.pro'); // Full path or basename
  });

  it('detects CMake Qt project', async () => {
    await createFile(
      'CMakeLists.txt',
      'cmake_minimum_required(VERSION 3.16)\nproject(MyApp)\nfind_package(Qt6 COMPONENTS Widgets REQUIRED)',
    );
    const ctx = await detectQtProject(tempDir);
    expect(ctx.isQtProject).toBe(true);
    expect(ctx.buildSystem).toBe('cmake');
    expect(ctx.qtVersion).toBe('6.x');
  });

  it('detects Qt5 in CMake', async () => {
    await createFile('CMakeLists.txt', 'find_package(Qt5 REQUIRED COMPONENTS Core Widgets)');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.qtVersion).toBe('5.x');
  });

  it('detects .ui files', async () => {
    await createFile('mainwindow.ui', '<ui version="4.0"><class>MainWindow</class></ui>');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.hasUiFiles).toBe(true);
  });

  it('detects .qrc files', async () => {
    await createFile('resources.qrc', '<RCC><qresource prefix="/"></qresource></RCC>');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.hasQrcFiles).toBe(true);
  });

  it('flags as Qt project when .ui or .qrc exist without build file', async () => {
    await createFile('form.ui', '');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.isQtProject).toBe(true);
  });

  it('returns no Qt project for empty directory', async () => {
    const ctx = await detectQtProject(tempDir);
    expect(ctx.isQtProject).toBe(false);
    expect(ctx.buildSystem).toBeUndefined();
  });

  it('reads Qt version from .pro file', async () => {
    await createFile('app.pro', 'QT += core widgets\nQT_VERSION = 6.5.1');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.qtVersion).toBe('6.5.1');
  });

  it('detects .pri files as Qt project', async () => {
    await createFile('common.pri', 'QT += core');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.isQtProject).toBe(true);
  });

  it('detects AUTOMOC in CMake', async () => {
    await createFile('CMakeLists.txt', 'set(CMAKE_AUTOMOC ON)\nadd_executable(app main.cpp)');
    const ctx = await detectQtProject(tempDir);
    expect(ctx.isQtProject).toBe(true);
    expect(ctx.buildSystem).toBe('cmake');
  });
});

// ──────────────────────────────────────────────
// QtPrompt tests
// ──────────────────────────────────────────────

describe('buildQtPrompt', () => {
  it('includes build system info for qmake', () => {
    const ctx: QtContext = {
      isQtProject: true,
      buildSystem: 'qmake',
      hasUiFiles: false,
      hasQrcFiles: false,
    };
    const prompt = buildQtPrompt(ctx);
    expect(prompt).toContain('qmake');
    expect(prompt).toContain('Qt Project Context');
  });

  it('includes Qt version when known', () => {
    const ctx: QtContext = {
      isQtProject: true,
      buildSystem: 'cmake',
      qtVersion: '6.5.1',
      hasUiFiles: true,
      hasQrcFiles: true,
    };
    const prompt = buildQtPrompt(ctx);
    expect(prompt).toContain('Qt 6.5.1');
    expect(prompt).toContain('ui files');
    expect(prompt).toContain('qrc files');
  });

  it('includes Qt5→Qt6 migration rules', () => {
    const ctx: QtContext = {
      isQtProject: true,
      buildSystem: 'qmake',
      hasUiFiles: false,
      hasQrcFiles: false,
    };
    const prompt = buildQtPrompt(ctx);
    expect(prompt).toContain('QTextCodec');
    expect(prompt).toContain('QRegularExpression');
  });

  it('includes MOC guidance', () => {
    const ctx: QtContext = {
      isQtProject: true,
      buildSystem: 'cmake',
      hasUiFiles: false,
      hasQrcFiles: false,
    };
    const prompt = buildQtPrompt(ctx);
    expect(prompt).toContain('Q_OBJECT');
    expect(prompt).toContain('MOC');
  });

  it('includes signal/slot best practices', () => {
    const ctx: QtContext = {
      isQtProject: true,
      buildSystem: 'qmake',
      hasUiFiles: false,
      hasQrcFiles: false,
    };
    const prompt = buildQtPrompt(ctx);
    expect(prompt).toContain('connect(sender, &Sender::signal');
    expect(prompt).toContain('SIGNAL()/SLOT()');
  });
});

// ──────────────────────────────────────────────
// QtTools tests
// ──────────────────────────────────────────────

describe('createQtTools', () => {
  const ctx: QtContext = {
    isQtProject: true,
    buildSystem: 'qmake',
    hasUiFiles: true,
    hasQrcFiles: true,
  };

  it('creates all 12 Qt tools', () => {
    const tools = createQtTools(ctx);
    const names = tools.map((t) => t.name);
    expect(names).toContain('QtBuild');
    expect(names).toContain('QtSignals');
    expect(names).toContain('QtProFile');
    expect(names).toContain('QtMigration');
    expect(names).toContain('QtUi');
    expect(names).toContain('QtQml');
    expect(names).toContain('QtTestGen');
    expect(names).toContain('QtTestRunner');
    expect(names).toContain('QtCoverage');
    expect(names).toContain('QtGraphics');
    expect(names).toContain('QtCharts');
    expect(names).toContain('QtMath');
    expect(names).toContain('QtModelView');
    expect(names).toContain('QtThread');
    expect(tools).toHaveLength(14);
  });

  it('each tool has required metadata', () => {
    const tools = createQtTools(ctx);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('QtBuild tool has correct parameter schema', () => {
    const tools = createQtTools(ctx);
    const buildTool = tools.find((t) => t.name === 'QtBuild');
    expect(buildTool).toBeDefined();
    expect(buildTool!.parameters).toHaveProperty('type', 'object');
  });

  it('QtSignals tool has correct parameter schema', () => {
    const tools = createQtTools(ctx);
    const sigTool = tools.find((t) => t.name === 'QtSignals');
    expect(sigTool).toBeDefined();
  });

  it('QtMigration tool scans for deprecated APIs', async () => {
    // Create a source file with a known deprecated API
    await createFile('oldcode.cpp', '#include <QTextCodec>\nvoid f() { QTextCodec::codecForName("UTF-8"); }');
    const tools = createQtTools(ctx);
    const migrationTool = tools.find((t) => t.name === 'QtMigration');
    expect(migrationTool).toBeDefined();
    const result = await migrationTool!.execute({ cwd: tempDir });
    expect(result).toContain('QTextCodec');
    expect(result).not.toBe('No Qt5 → Qt6 migration issues found.');
  });

  it('QtMigration ignores generated moc/ui files', async () => {
    await createFile('moc_oldcode.cpp', 'QTextCodec *c;');
    const tools = createQtTools(ctx);
    const migrationTool = tools.find((t) => t.name === 'QtMigration');
    const result = await migrationTool!.execute({ cwd: tempDir });
    expect(result).toContain('No Qt5 → Qt6 migration issues found');
  });

  it('QtMigration reports Qt6-clean codebase correctly', async () => {
    await createFile('modern.cpp', '// Qt6 compatible code\nQRegularExpression re;\nQStringConverter conv;');
    const tools = createQtTools(ctx);
    const migrationTool = tools.find((t) => t.name === 'QtMigration');
    const result = await migrationTool!.execute({ cwd: tempDir });
    expect(result).toContain('No Qt5 → Qt6 migration issues found');
  });

  it('QtTestGen generates test code from QObject header', async () => {
    await createFile(
      'MyWidget.h',
      `class MyWidget : public QWidget {
    Q_OBJECT
public:
    explicit MyWidget(QWidget *parent = nullptr);
    void doSomething(int value);
    QString name() const;
    void setName(const QString &n);
signals:
    void valueChanged(int newValue);
    void finished();
public slots:
    void refresh();
};`,
    );
    const tools = createQtTools(ctx);
    const genTool = tools.find((t) => t.name === 'QtTestGen');
    expect(genTool).toBeDefined();
    const result = await genTool!.execute({ headerPath: join(tempDir, 'MyWidget.h'), cwd: tempDir });
    expect(result).toContain('tst_MyWidget');
    expect(result).toContain('testConstructor');
    expect(result).toContain('test_doSomething');
    expect(result).toContain('test_name');
    expect(result).toContain('test_signal_valueChanged');
    expect(result).toContain('test_signal_finished');
    expect(result).toContain('test_slot_refresh');
    expect(result).toContain('QSignalSpy');
    expect(result).toContain('QTEST_MAIN');
  });

  it('QtCoverage detects untested QObject classes', async () => {
    await createFile(
      'Worker.h',
      `class Worker : public QObject {
    Q_OBJECT
public:
    void process();
signals:
    void done();
};`,
    );
    const tools = createQtTools(ctx);
    const covTool = tools.find((t) => t.name === 'QtCoverage');
    expect(covTool).toBeDefined();
    const result = await covTool!.execute({ cwd: tempDir });
    expect(result).toContain('Worker');
    expect(result).toContain('No test file');
    expect(result).toContain('done');
  });

  it('QtMath eval evaluates expressions correctly', async () => {
    const tools = createQtTools(ctx);
    const mathTool = tools.find((t) => t.name === 'QtMath');
    expect(mathTool).toBeDefined();
    const result = await mathTool!.execute({ action: 'eval', expression: '2 + 3 * 4' });
    expect(result).toContain('14');
  });

  it('QtCharts returns overview without args', async () => {
    const tools = createQtTools(ctx);
    const chartTool = tools.find((t) => t.name === 'QtCharts');
    expect(chartTool).toBeDefined();
    const result = await chartTool!.execute({});
    expect(result).toContain('QLineSeries');
    expect(result).toContain('QChartView');
  });

  it('QtCharts returns detailed ref for specific type', async () => {
    const tools = createQtTools(ctx);
    const chartTool = tools.find((t) => t.name === 'QtCharts');
    const result = await chartTool!.execute({ chartType: 'pie' });
    expect(result).toContain('QPieSeries');
    expect(result).toContain('setHoleSize');
  });

  it('QtGraphics analyzes painter code', async () => {
    await createFile(
      'widget.cpp',
      'void MyWidget::paintEvent(QPaintEvent *) {\n' +
        '    QPainter p(this);\n' +
        '    p.setPen(Qt::red);\n' +
        '    p.drawText(10, 10, "Hello");\n' +
        '    p.end();\n' +
        '}',
    );
    const tools = createQtTools(ctx);
    const gfxTool = tools.find((t) => t.name === 'QtGraphics');
    expect(gfxTool).toBeDefined();
    const result = await gfxTool!.execute({ cwd: tempDir });
    // Should detect state changes without save/restore
    expect(result).toContain('save()');
  });

  it('QtModelView analyzes model/view code', async () => {
    await createFile(
      'mymodel.h',
      `class MyModel : public QAbstractItemModel {
    Q_OBJECT
public:
    QVariant data(const QModelIndex &idx, int role) const override {
        if (role == Qt::DisplayRole) return QString("data");
        return QVariant();
    }
    void addRow() { beginInsertRows(QModelIndex(), 0, 0); }
};`,
    );
    const tools = createQtTools(ctx);
    const mvTool = tools.find((t) => t.name === 'QtModelView');
    expect(mvTool).toBeDefined();
    const result = await mvTool!.execute({ cwd: tempDir });
    expect(result).toContain('endInsertRows');
  });

  it('QtThread detects QThread subclass anti-pattern', async () => {
    await createFile(
      'worker.h',
      `class Worker : public QThread {
    Q_OBJECT
    void run() override {
        emit resultReady();
    }
signals:
    void resultReady();
};`,
    );
    const tools = createQtTools(ctx);
    const threadTool = tools.find((t) => t.name === 'QtThread');
    expect(threadTool).toBeDefined();
    const result = await threadTool!.execute({ cwd: tempDir });
    expect(result).toContain('moveToThread');
  });
});
