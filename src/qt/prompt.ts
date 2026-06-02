/**
 * Qt-specific system prompt segment.
 * Appended to the base system prompt when a Qt project is detected.
 */
import type { QtContext } from './detector.js';

export function buildQtPrompt(ctx: QtContext): string {
  const parts: string[] = [];

  parts.push(`## Qt Project Context
You are working in a Qt project${ctx.qtVersion ? ` (Qt ${ctx.qtVersion})` : ''} using ${ctx.buildSystem || 'an unknown build system'}.
${ctx.hasUiFiles ? 'This project has .ui files (Qt Designer forms).' : ''}
${ctx.hasQrcFiles ? 'This project has .qrc files (Qt resource files).' : ''}`);

  parts.push(`## Qt-Specific Rules

### Build System
- ${ctx.buildSystem === 'qmake' ? 'Use qmake to generate Makefiles, then make/nmake to build.' : ctx.buildSystem === 'cmake' ? 'Use cmake to configure and build. Qt CMake projects need AUTOMOC, AUTORCC, AUTOUIC enabled.' : 'Determine build system from project files.'}
- Never run "qmake -project" unless the user explicitly asks — it regenerates the .pro file destructively.

### MOC (Meta-Object Compiler)
- Classes with Q_OBJECT macro MUST be processed by MOC.
- In CMake: set AUTOMOC ON. In qmake: handled automatically for headers listed in HEADERS.
- Never create QObject subclasses outside of header files — MOC processes headers only.
- If linking errors mention "vtable for X" or "undefined reference to X::metaObject", check that Q_OBJECT is present and the header is listed in the build file.

### Signals and Slots
- Prefer the type-safe new-style syntax: \`connect(sender, &Sender::signal, receiver, &Receiver::slot)\`
- Do NOT use the string-based SIGNAL()/SLOT() macros in Qt5+ — they skip compile-time checks.
- Disconnect in destructors or use Qt::UniqueConnection to avoid duplicate connections.
- For lambda connections, capture sender/receiver as QPointer to avoid dangling references.
- Cross-thread signals: use Qt::QueuedConnection (automatic when sender/receiver are in different threads).

### QML
- QML components registered with qmlRegisterType are accessible by their QML name, not C++ class name.
- Context properties set via rootContext()->setContextProperty() are visible in all QML files.
- For QML-C++ integration, prefer QML_ELEMENT and QML_NAMED_ELEMENT macros over setContextProperty().
- QML files load relative to the QML engine's base URL (usually the application directory or qrc root).

### Memory and Ownership
- Qt's parent-child ownership model: child QObjects are deleted when the parent is deleted.
- Use deleteLater() instead of raw delete for QObjects in event loops.
- QLayout takes ownership of widgets added with addWidget() — don't delete them manually.
- QAbstractItemModel: never delete items returned by data() or index() — they're owned by the model.

### Qt5 → Qt6 Migration
- QTextCodec removed → use QStringConverter / QStringDecoder
- QRegExp removed → use QRegularExpression
- QDesktopWidget removed → use QScreen
- QMatrix removed → use QTransform
- QString::SkipEmptyParts → Qt::SkipEmptyParts
- QMediaPlayer API changed significantly → check Qt6 multimedia docs
- QML version imports: \`import QtQuick 2.15\` → \`import QtQuick\` (versionless)
- qrand() / qsrand() removed → use QRandomGenerator

### Best Practices
- Use QPointer<T> when storing pointers to QObjects that might be deleted.
- Avoid deep widget hierarchies — prefer QML for complex UIs.
- Use Qt::AutoConnection for connect() — it picks Direct/Queued automatically.
- Never call processEvents() as a workaround — fix the underlying event loop issue.
- Model/View: prefer setModel() over manual item creation in views.

### Testing (QTest Framework)
- Test class naming: \`tst_ClassName\` inheriting QObject with Q_OBJECT macro.
- Use QTEST_MAIN(tst_ClassName) to generate main(). Include the .moc file at the end.
- Test methods are private slots: \`void test_featureName();\`
- Use QVERIFY(bool) for boolean checks, QCOMPARE(actual, expected) for value comparisons.
- For signal testing: QSignalSpy spy(&obj, &Class::signalName); trigger the signal; QCOMPARE(spy.count(), 1).
- For async testing: use QTimer::singleShot or QSignalSpy::wait(ms) to handle event loops.
- GUI tests: set QT_QPA_PLATFORM=offscreen for headless test execution.
- Property testing: use QObject::property()/setProperty() or direct getter/setter calls.
- Test coverage gaps: signals that are emitted but never tested, slots triggered by .ui auto-connections.
- Never call qApp->processEvents() in tests — use QSignalSpy::wait() instead.
- Benchmarks: QBENCHMARK { /* code */ } for performance regression testing.
- Data-driven tests: QTest::addColumn<T>() + QTest::newRow() + QFETCH(T, name).
- Test organization: initTestCase() runs once before all tests; cleanupTestCase() runs once after.`);

  return parts.join('\n\n');
}
