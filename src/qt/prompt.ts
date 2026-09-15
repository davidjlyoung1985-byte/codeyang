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
- Test organization: initTestCase() runs once before all tests; cleanupTestCase() runs once after.

### Model/View Architecture
- Qt's Model/View separates data (model), presentation (view), and selection (selection model).
- Use QAbstractItemModel for custom data — implement rowCount(), columnCount(), data(), index(), parent().
- For read-only models, override data() and rowCount() only. For editable, also flags() and setData().
- QStandardItemModel is the simplest: create items, set text/data, append rows. Good for small datasets.
- For large datasets (>10K rows), use QAbstractTableModel with lazy data() — don't store all items in memory.
- beginInsertRows()/endInsertRows() MUST be called before/after structural changes — or views crash.
- beginResetModel()/endResetModel() is expensive — avoid for single-item changes.
- QSortFilterProxyModel filters/sorts without copying data — prefer over manual sorting.
- QDataWidgetMapper maps model columns to form widgets — ideal for database record editing.
- Never delete items returned by data() or index() — they're owned by the model.
- With QML, models exposed via Q_PROPERTY or setContextProperty are accessible in ListView/Repeater.
- Custom roles use Qt::UserRole + N; cast with model->data(idx, Qt::UserRole+1).value<MyType>().

### Threading and Concurrency
- QObject is NOT thread-safe. Each QObject lives in one thread (thread affinity).
- Cross-thread signals: Qt::QueuedConnection is automatic when sender/receiver are in different threads.
- NEVER call GUI methods from non-GUI threads — use QMetaObject::invokeMethod() with Qt::QueuedConnection.
- QThread::run() is the worker thread entry point. Override it, or use worker-object approach (moveToThread).
- Worker-object pattern (preferred): create QObject subclass, moveToThread(), connect signals to start work.
- QMutex for exclusive access; QReadWriteLock for read-heavy scenarios; QSemaphore for resource counting.
- QWaitCondition for thread synchronization — always use with QMutex.
- QtConcurrent::run() / QtConcurrent::map() for simple parallel tasks without explicit thread management.
- QThreadPool with QRunnable for reusable worker pools — setMaxThreadCount() to control parallelism.
- Never subclass QThread unless you REALLY need to modify thread behavior — use moveToThread pattern.
- QAtomicInt / QAtomicPointer for lock-free atomic operations (counters, flags).
- QFuture/QFutureWatcher for async result monitoring with QtConcurrent or custom futures.

### Networking
- QNetworkAccessManager is the central HTTP client — create ONE instance per application (reuse it).
- QNetworkRequest sets headers, URL, attributes; QNetworkReply handles the response ASYNCHRONOUSLY.
- ALWAYS connect to QNetworkReply::finished() — never block the event loop waiting for network.
- QNetworkReply::error() check BEFORE reading data — error() != NoError means the request failed.
- QNetworkAccessManager::setRedirectPolicy() to control HTTP redirects (default: manual).
- QSslConfiguration for TLS settings; setPeerVerifyMode() for self-signed certificates in dev.
- For REST APIs: QNetworkRequest::setHeader(QNetworkRequest::ContentTypeHeader, "application/json").
- QTcpSocket for TCP (stream-oriented); QUdpSocket for UDP (datagram); QWebSocket for WebSocket.
- QTcpServer::listen() to accept connections; override incomingConnection() or connect to newConnection().
- NEVER use blocking waitForReadyRead()/waitForConnected() in the GUI thread.
- QNetworkInformation in Qt 6.7+ for network reachability/type detection.

### Serialization (JSON/XML/Stream)
- QJsonDocument::fromJson() parses JSON; toJson() serializes. Use QJsonObject/QJsonArray for structured access.
- QJsonObject::value("key") returns QJsonValue; check isNull() before using.
- For C++ struct <-> JSON: register converters with QJsonValue::fromVariant() or manual serialize/deserialize methods.
- QXmlStreamReader/Writer for efficient, non-DOM XML processing — preferred for large files.
- QDomDocument for full DOM access (loads entire document into memory — avoid for >10MB XML).
- QDataStream for binary serialization — use setVersion() for compatibility across Qt versions.
- QSettings for application settings — portable across platforms (registry on Windows, plist on macOS, ini on Linux).
- QSaveFile for atomic file writes — writes to temp first, then renames (prevents data loss on crash).
- In Qt6: QJsonDocument::toJson() returns QByteArray by value; in Qt5: took a reference parameter.

### Internationalization (i18n)
- Wrap all user-visible strings in tr(): label->setText(tr("Hello")). NEVER use raw Chinese/English strings.
- QObject::tr() with class context — derived classes get their own translation context.
- lupdate scans source for tr() calls, generates .ts XML files. lrelease compiles .ts to .qm binaries.
- In .pro: TRANSLATIONS += myapp_zh_CN.ts myapp_ja.ts.
- In CMake: qt_add_translations(myapp TS_FILES myapp_zh_CN.ts).
- QTranslator::load() loads .qm; QCoreApplication::installTranslator() activates it.
- For plurals: tr("1 file found", "%n files found", 0, n). The %n is replaced by Qt.
- NEVER concatenate translated strings: tr("Found ") + QString::number(n) + tr(" files") — use %n.
- Qt Linguist is the GUI tool for translators to edit .ts files.
- QLocale::system() for current locale; QLocale::setDefault() to override.`);

  return parts.join('\n\n');
}
