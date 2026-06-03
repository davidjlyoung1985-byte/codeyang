/**
 * Qt tool factory — creates ToolDefinition[] for registration into the tool registry.
 * Conditionally called when a Qt project is detected.
 */
import type { ToolDefinition } from '../types.js';
import type { QtContext } from './detector.js';
import { executeQtBuild } from './tools/QtBuildTool.js';
import { executeQtSignals } from './tools/QtSignalsTool.js';
import { executeQtProFile } from './tools/QtProFileTool.js';
import { executeQtMigration } from './tools/QtMigrationTool.js';
import { executeQtUi } from './tools/QtUiTool.js';
import { executeQtQml } from './tools/QtQmlTool.js';
import { executeQtTestGen } from './testing/QtTestGen.js';
import { executeQtTestRunner } from './testing/QtTestRunner.js';
import { executeQtCoverage } from './testing/QtCoverage.js';
import { executeQtGraphics } from './tools/QtGraphicsTool.js';
import { executeQtCharts } from './tools/QtChartsTool.js';
import { executeQtMath } from './tools/QtMathTool.js';
import { executeQtModelView } from './tools/QtModelViewTool.js';
import { executeQtThread } from './tools/QtThreadTool.js';

export function createQtTools(ctx: QtContext): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: 'QtBuild',
      description:
        'Build the current Qt project. Detects the build system automatically. ' +
        'Parses compiler/linker output and provides Qt-specific diagnostics for common errors ' +
        '(missing Q_OBJECT, MOC issues, linker problems).',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Build target name (e.g. "all", or specific target). Default: all.',
          },
          buildSystem: {
            type: 'string',
            enum: ['qmake', 'cmake', 'auto'],
            description: 'Build system to use. Default: auto-detect from project.',
          },
          cwd: { type: 'string', description: 'Working directory (default: project root)' },
        },
        required: [],
      },
      execute: async (args) => {
        const target = args['target'] ? String(args['target']) : '';
        const buildSystem = (args['buildSystem'] as string) || ctx.buildSystem || 'auto';
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtBuild(buildSystem as 'qmake' | 'cmake' | 'auto', target, cwd);
      },
    },
    {
      name: 'QtSignals',
      description:
        'Analyze signal-slot connections in the Qt project. Finds all connect() calls, ' +
        'detects old-style SIGNAL/SLOT macros that should be migrated, ' +
        'and identifies auto-connections from .ui forms. ' +
        'Use this before modifying signal-slot wiring.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtSignals(cwd);
      },
    },
    {
      name: 'QtProFile',
      description:
        'Read and analyze a .pro (qmake project) file. Lists Qt modules, sources, headers, ' +
        'forms, resources, and libraries. Detects common configuration issues.',
      parameters: {
        type: 'object',
        properties: {
          proPath: {
            type: 'string',
            description: 'Path to .pro file. If not specified, auto-discovers in project root.',
          },
          cwd: { type: 'string', description: 'Working directory (default: project root)' },
        },
        required: [],
      },
      execute: async (args) => {
        const proPath = args['proPath'] ? String(args['proPath']) : undefined;
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtProFile(proPath, cwd);
      },
    },
    {
      name: 'QtMigration',
      description:
        'Scan the Qt project for deprecated Qt5 APIs that need migration to Qt6. ' +
        'Detects 30+ common API changes across Core, Gui, Widgets, Network, Multimedia, and QML. ' +
        'Reports errors (will not compile), warnings (behavior change), and info (minor changes). ' +
        'Use this before upgrading a project from Qt5 to Qt6.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtMigration(cwd);
      },
    },
    {
      name: 'QtUi',
      description:
        'Analyze Qt Designer .ui form files. Shows widget hierarchy, object names, ' +
        'signal-slot connections defined in the UI, custom widgets, and includes. ' +
        'Detects auto-connection patterns (on_widgetName_signalName) that your C++ code uses.',
      parameters: {
        type: 'object',
        properties: {
          uiPath: {
            type: 'string',
            description: 'Path to a specific .ui file. If not specified, scans all .ui files in the project.',
          },
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const uiPath = args['uiPath'] ? String(args['uiPath']) : undefined;
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtUi(uiPath, cwd);
      },
    },
    {
      name: 'QtQml',
      description:
        'Analyze QML files for common issues. Detects: versioned imports (migrate to versionless), ' +
        'deprecated module usage (QtGraphicalEffects, QtQuick.Controls 1.x), ' +
        'anchors vs x/y conflicts, deep nesting, missing ids, and C++ integration points. ' +
        'Also reports component usage statistics per file.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtQml(cwd);
      },
    },
    {
      name: 'QtTestGen',
      description:
        'Generate QTest unit test code from C++ headers. Parses class declarations to produce a complete test skeleton: ' +
        'constructor tests, method tests, signal tests with QSignalSpy, property read/write/notify tests, ' +
        'and Q_INVOKABLE tests. Outputs compilable .cpp code ready to add to the build.',
      parameters: {
        type: 'object',
        properties: {
          headerPath: {
            type: 'string',
            description: 'Path to a .h header file. If not specified, scans project for QObject headers.',
          },
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const headerPath = args['headerPath'] ? String(args['headerPath']) : undefined;
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtTestGen(headerPath, cwd);
      },
    },
    {
      name: 'QtTestRunner',
      description:
        'Run a compiled QTest executable and parse the results. Uses -xml output for structured reporting. ' +
        'Reports pass/fail/skip counts, duration, and detailed failure messages with file locations. ' +
        'Automatically sets QT_QPA_PLATFORM=offscreen for headless execution.',
      parameters: {
        type: 'object',
        properties: {
          testPath: {
            type: 'string',
            description: 'Path to the compiled test executable (e.g. build/tst_myclass).',
          },
          cwd: { type: 'string', description: 'Working directory (default: project root)' },
        },
        required: ['testPath'],
      },
      execute: async (args) => {
        const testPath = String(args['testPath'] ?? '');
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtTestRunner(testPath, cwd);
      },
    },
    {
      name: 'QtCoverage',
      description:
        'Analyze test coverage gaps in a Qt project. Cross-references QObject classes (signals, slots, properties) ' +
        'against existing test files (tst_*.cpp, *_test.cpp). Reports untested classes, signals, slots, properties, ' +
        'and signal-slot connections with a coverage percentage per class.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtCoverage(cwd);
      },
    },
    {
      name: 'QtGraphics',
      description:
        'Analyze QPainter, QGraphicsView, and rendering code for anti-patterns and performance issues. ' +
        'Detects: missing save()/restore(), inline image creation in paintEvent, update() inside paintEvent, ' +
        'missing antialiasing for text, uncached QGraphicsItem::paint(), and QPixmap::grabWidget (Qt6 removed).',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtGraphics(cwd);
      },
    },
    {
      name: 'QtCharts',
      description:
        'Reference and code generator for Qt Charts. Provides instant lookup for all chart types ' +
        '(line, scatter, bar, pie, spline, area, candlestick, box plot, polar). ' +
        'Shows minimal examples, common patterns (live updates, multi-axis, .ui integration), and anti-patterns. ' +
        'Use "QtCharts <type>" for detailed reference on a specific chart type.',
      parameters: {
        type: 'object',
        properties: {
          chartType: {
            type: 'string',
            description: 'Specific chart type for detailed reference. Leave empty for overview. Types: line, scatter, bar, pie, spline, area, candlestick, boxplot, polar, financial.',
          },
        },
        required: [],
      },
      execute: async (args) => {
        const chartType = args['chartType'] ? String(args['chartType']) : undefined;
        return executeQtCharts(chartType);
      },
    },
    {
      name: 'QtMath',
      description:
        'Qt math utilities reference and safe expression evaluator. ' +
        'Covers: QtMath/QtNumeric headers, common math patterns, QVector2D/3D/4D operations, ' +
        'QMatrix4x4 transforms, QRect geometry, numerical constants, and safe numeric patterns. ' +
        'Use "QtMath eval <expression>" to evaluate a math expression.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '"eval" to evaluate an expression, or leave empty for API reference.',
          },
          expression: {
            type: 'string',
            description: 'Math expression to evaluate (only when action is "eval"). Example: "2 + 3 * 4".',
          },
        },
        required: [],
      },
      execute: async (args) => {
        const action = args['action'] ? String(args['action']) : undefined;
        const expression = args['expression'] ? String(args['expression']) : undefined;
        return executeQtMath(action, expression);
      },
    },
    {
      name: 'QtModelView',
      description:
        'Analyze Qt Model/View architecture. Detects anti-patterns: beginInsertRows without endInsertRows, ' +
        'beginResetModel overuse, multiple setModel() without disconnect, ' +
        'missing parent() in tree models, createIndex without caching, ' +
        'allocations in DisplayRole handler, unhandled roles in data(). ' +
        'Counts models, views, delegates, and proxies in the project.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtModelView(cwd);
      },
    },
    {
      name: 'QtThread',
      description:
        'Analyze Qt threading/concurrency code for safety issues. Detects: GUI calls from QThread::run(), ' +
        'blocking waitFor*() in main thread, QMutex lock without unlock, processEvents() anti-pattern, ' +
        'direct QThread subclassing (prefer moveToThread), QtConcurrent without error handling, ' +
        'lockForWrite without unlock, direct delete in thread context.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project root (default: current working directory)' },
        },
        required: [],
      },
      execute: async (args) => {
        const cwd = args['cwd'] ? String(args['cwd']) : undefined;
        return executeQtThread(cwd);
      },
    },
  ];

  return tools;
}
