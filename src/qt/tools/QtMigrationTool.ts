/**
 * QtMigrationTool — Scan a Qt project for deprecated Qt5 APIs that need Qt6 migration.
 * Covers 30+ common API changes. Each finding includes the file, line, and migration advice.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

interface MigrationFinding {
  file: string;
  line: number;
  snippet: string;
  category: string;
  old: string;
  replacement: string;
  severity: 'error' | 'warning' | 'info';
}

// ─── Migration Rules ─────────────────────────────────────────────────────────
// Each rule has: pattern (regex), category, old API name, replacement, severity
interface MigrationRule {
  pattern: RegExp;
  category: string;
  old: string;
  replacement: string;
  severity: 'error' | 'warning' | 'info';
}

const RULES: MigrationRule[] = [
  // ═══ Core — removed APIs ═══
  {
    pattern: /\bQTextCodec\b/,
    category: 'Core',
    old: 'QTextCodec',
    replacement: 'QStringConverter / QStringDecoder / QStringEncoder',
    severity: 'error',
  },
  {
    pattern: /\bQRegExp\b/,
    category: 'Core',
    old: 'QRegExp',
    replacement: 'QRegularExpression',
    severity: 'error',
  },
  {
    pattern: /\b(QString::SkipEmptyParts|QString::KeepEmptyParts)\b/,
    category: 'Core',
    old: 'QString::SkipEmptyParts / KeepEmptyParts',
    replacement: 'Qt::SkipEmptyParts / Qt::KeepEmptyParts',
    severity: 'error',
  },
  {
    pattern: /\bqrand\s*\(|qsrand\s*\(/,
    category: 'Core',
    old: 'qrand() / qsrand()',
    replacement: 'QRandomGenerator::global()->bounded() / QRandomGenerator::securelySeeded()',
    severity: 'error',
  },
  {
    pattern: /\bQLinkedList\b/,
    category: 'Core',
    old: 'QLinkedList',
    replacement: 'std::list',
    severity: 'warning',
  },
  {
    pattern: /\bQSet\b.*\bfromList\b/,
    category: 'Core',
    old: 'QSet::fromList()',
    replacement: 'QSet(range.begin(), range.end())',
    severity: 'warning',
  },
  {
    pattern: /\b(QMultiMap|QMultiHash)\b.*\binsertMulti\b/,
    category: 'Core',
    old: 'QMap/QHash::insertMulti()',
    replacement: 'Use QMultiMap or QMultiHash directly',
    severity: 'warning',
  },

  // ═══ Gui — removed/changed APIs ═══
  {
    pattern: /\bQDesktopWidget\b/,
    category: 'Gui',
    old: 'QDesktopWidget',
    replacement: 'QScreen (via QGuiApplication::primaryScreen())',
    severity: 'error',
  },
  {
    pattern: /\bQMatrix\b/,
    category: 'Gui',
    old: 'QMatrix',
    replacement: 'QTransform',
    severity: 'error',
  },
  {
    pattern: /\bQPainter::HighQualityAntialiasing\b/,
    category: 'Gui',
    old: 'QPainter::HighQualityAntialiasing',
    replacement: 'QPainter::Antialiasing (or combine flags)',
    severity: 'warning',
  },
  {
    pattern: /\bQFont::ForceIntegerMetrics\b/,
    category: 'Gui',
    old: 'QFont::ForceIntegerMetrics',
    replacement: 'No direct replacement — integer metrics are default on some platforms',
    severity: 'info',
  },
  {
    pattern: /\bQFontDatabase\b.*\bfamilies\b/,
    category: 'Gui',
    old: 'QFontDatabase().families()',
    replacement: 'QFontDatabase::families() (static method in Qt6)',
    severity: 'warning',
  },

  // ═══ Widgets ═══
  {
    pattern: /\bQWidget::setBackgroundColor\b/,
    category: 'Widgets',
    old: 'QWidget::setBackgroundColor()',
    replacement: 'Set background via QPalette or stylesheet',
    severity: 'warning',
  },
  {
    pattern: /\bQWidget::setBackgroundRole\b/,
    category: 'Widgets',
    old: 'QWidget::setBackgroundRole()',
    replacement: 'QPalette with QPalette::Window',
    severity: 'warning',
  },
  {
    pattern: /\bQStyleOption.*::init\b/,
    category: 'Widgets',
    old: 'QStyleOption::init(QWidget*)',
    replacement: 'QStyleOption::initFrom(QWidget*)',
    severity: 'error',
  },
  {
    pattern: /\bQAction\b.*\b(?:setMenuText|menuText)\b/,
    category: 'Widgets',
    old: 'QAction::menuText() / setMenuText()',
    replacement: 'No direct replacement — use multiple QAction instances',
    severity: 'warning',
  },

  // ═══ Network ═══
  {
    pattern:
      /\bQNetworkRequest::(?:setAttribute|attribute)\s*\(\s*QNetworkRequest::(?:HttpPipeliningAllowedAttribute|SpdyAllowedAttribute|FollowRedirectsAttribute)\b/,
    category: 'Network',
    old: 'QNetworkRequest attributes for HTTP/2, SPDY, redirects',
    replacement: 'Use QNetworkRequest::setTransferTimeout() / setHttp2Configuration()',
    severity: 'warning',
  },
  {
    pattern: /\b(QSslCertificate|QSslKey)\s*\(/,
    category: 'Network',
    old: 'QSslCertificate/QSslKey constructors with pointer args',
    replacement: 'Constructors now take by-value parameters',
    severity: 'warning',
  },

  // ═══ Multimedia ═══
  {
    pattern: /\bQMediaPlayer\b/,
    category: 'Multimedia',
    old: 'QMediaPlayer (Qt5 API)',
    replacement: 'QMediaPlayer (completely redesigned in Qt6 — check Qt6 Multimedia docs)',
    severity: 'warning',
  },
  {
    pattern: /\bQMediaPlaylist\b/,
    category: 'Multimedia',
    old: 'QMediaPlaylist',
    replacement: 'Manage playlist logic manually with QMediaPlayer::setSource() calls',
    severity: 'warning',
  },
  {
    pattern: /\bQAudioDecoder\b/,
    category: 'Multimedia',
    old: 'QAudioDecoder',
    replacement: 'QAudioDecoder in Qt6 has simplified API — check docs',
    severity: 'info',
  },

  // ═══ QML ═══
  {
    pattern: /import\s+QtQuick\s+2\.\d+/,
    category: 'QML',
    old: 'import QtQuick 2.x',
    replacement: 'import QtQuick (versionless import)',
    severity: 'warning',
  },
  {
    pattern: /import\s+QtQuick\.Controls\s+[12]\.\d+/,
    category: 'QML',
    old: 'import QtQuick.Controls 1.x / 2.x',
    replacement: 'import QtQuick.Controls (versionless)',
    severity: 'warning',
  },
  {
    pattern: /import\s+QtQuick\.Window\s+2\.\d+/,
    category: 'QML',
    old: 'import QtQuick.Window 2.x',
    replacement: 'import QtQuick.Window (versionless)',
    severity: 'warning',
  },
  {
    pattern: /import\s+QtGraphicalEffects\s+\d/,
    category: 'QML',
    old: 'QtGraphicalEffects',
    replacement: 'Qt5Compat.GraphicalEffects (or Qt Quick Effects in Qt6.5+)',
    severity: 'warning',
  },

  // ═══ QVariant ═══
  {
    pattern: /\bQVariant\s*\(\s*(\w+)\s*\)\s*[><=!]=?\s*(\w+)/,
    category: 'Core',
    old: 'QVariant comparison operators',
    replacement: 'QVariant::value<T>() or QVariant::canConvert<T>()',
    severity: 'warning',
  },
  {
    pattern: /\b(const|int|double|QString|bool)\s+\w+\s*=\s*\w+\.to\w+\(\)/,
    category: 'Core',
    old: 'QVariant::toXxx() (reduced type support)',
    replacement: 'Check supported QVariant conversions in Qt6 docs',
    severity: 'info',
  },

  // ═══ QTextStream ═══
  {
    pattern: /\bQTextStream\b.*\bsetCodec\b/,
    category: 'Core',
    old: 'QTextStream::setCodec()',
    replacement: 'Specify encoding in QTextStream constructor or use QStringConverter',
    severity: 'error',
  },

  // ═══ Miscellaneous ═══
  {
    pattern: /\bQProcess::(?:start|execute)\s*\(\s*"[^"]+"\s*,\s*QStringList/,
    category: 'Core',
    old: 'QProcess::start(program, QStringList)',
    replacement: 'QProcess::start(program, QStringList) still works, but use setProgram() for clarity',
    severity: 'info',
  },
  {
    pattern: /\bQDir::addResourceSearchPath\b/,
    category: 'Core',
    old: 'QDir::addResourceSearchPath()',
    replacement: 'QDir::addSearchPath() with "qt" prefix removed in Qt6',
    severity: 'warning',
  },
  {
    pattern: /\bQStringRef\b/,
    category: 'Core',
    old: 'QStringRef',
    replacement: 'QStringView',
    severity: 'error',
  },
  {
    pattern: /\bQString\b\s*::\s*splitRef\b/,
    category: 'Core',
    old: 'QString::splitRef()',
    replacement: 'QStringView(QString).split() or QStringTokenizer',
    severity: 'warning',
  },

  // ═══ Model/View ═══
  {
    pattern: /\bQAbstractItemModel::begin(?:Insert|Remove)Columns\b/,
    category: 'Model/View',
    old: 'QAbstractItemModel::beginInsertColumns() etc.',
    replacement: 'Use beginInsertColumns() with proper index handling (Qt6 changed column count semantics)',
    severity: 'warning',
  },
  {
    pattern: /\bQHeaderView::setMovable\b|\.setMovable\s*\(/,
    category: 'Model/View',
    old: 'QHeaderView::setMovable()',
    replacement: 'setSectionsMovable() (renamed in Qt6)',
    severity: 'error',
  },
  {
    pattern: /\bQHeaderView::setResizeMode\b|\.setResizeMode\s*\(/,
    category: 'Model/View',
    old: 'QHeaderView::setResizeMode()',
    replacement: 'setSectionResizeMode() (renamed in Qt6)',
    severity: 'error',
  },

  // ═══ Threading ═══
  {
    pattern: /\bQThread::(?:idealThreadCount|currentThreadId)\b/,
    category: 'Threading',
    old: 'QThread::idealThreadCount()',
    replacement: 'QThreadPool::globalInstance()->maxThreadCount() (QThread::idealThreadCount removed in Qt6)',
    severity: 'warning',
  },
  {
    pattern: /\bQFuture\b.*\bwaitForFinished\b/,
    category: 'Threading',
    old: 'QFuture::waitForFinished() (blocking)',
    replacement: 'QFutureWatcher::finished() signal for async completion notification',
    severity: 'warning',
  },

  // ═══ Networking ═══
  {
    pattern: /\bQNetworkConfigurationManager\b/,
    category: 'Network',
    old: 'QNetworkConfigurationManager',
    replacement: 'QNetworkInformation (Qt 6.7+) or manual reachability checks',
    severity: 'error',
  },
  {
    pattern: /\bQNetworkRequest::(?:HttpPipeliningAllowedAttribute|SpdyAllowedAttribute)/,
    category: 'Network',
    old: 'QNetworkRequest HTTP/2 attributes',
    replacement: 'QNetworkRequest::setHttp2Configuration() for HTTP/2 control',
    severity: 'warning',
  },
  {
    pattern: /\bQSslSocket::sslLibraryBuildVersionString\b/,
    category: 'Network',
    old: 'QSslSocket::sslLibraryBuildVersionString()',
    replacement: 'QSslSocket::sslLibraryVersionString() (renamed)',
    severity: 'warning',
  },

  // ═══ Model/View headers ═══
  {
    pattern: /\bQHeaderView::(?:Movable|Fixed|ResizeToContents|Stretch|Interactive)\b/,
    category: 'Model/View',
    old: 'QHeaderView::ResizeMode enum values',
    replacement: 'These were renamed in Qt6 Qt namespace: Qt::ScrollBarPolicy, Qt::FocusPolicy enums',
    severity: 'warning',
  },

  // ═══ State Machine ═══
  {
    pattern: /\bQStateMachine::(?:Running|NotRunning|ChildMode|ErrorState)\b/,
    category: 'Core',
    old: 'QStateMachine enum values',
    replacement: 'QStateMachine enums moved in Qt6 — check documentation for updated values',
    severity: 'warning',
  },

  // ═══ Serialization ═══
  {
    pattern: /\bQJsonDocument\b(?!\s*::)|\bQJsonObject\b(?!\s*::)/,
    category: 'Serialization',
    old: 'QJsonDocument fromBinaryData() / toBinaryData()',
    replacement: 'fromJson() / toJson() methods (binary methods removed in Qt6)',
    severity: 'info',
  },
  {
    pattern: /\bQJsonDocument::fromBinaryData\b/,
    category: 'Serialization',
    old: 'QJsonDocument::fromBinaryData()',
    replacement: 'Store JSON as text or use QDataStream with toJson(QJsonDocument::Compact)',
    severity: 'error',
  },

  // ═══ i18n ═══
  {
    pattern: /\bQLocale::(?:system|country|language)\s*\(\s*\)/,
    category: 'i18n',
    old: 'QLocale::system() method (removed)',
    replacement: 'QLocale::system() is now a static method that returns a QLocale object',
    severity: 'info',
  },
];

// ─── Scanner ─────────────────────────────────────────────────────────────────

const SOURCE_EXTS = new Set(['.cpp', '.h', '.hpp', '.cxx', '.cc']);
const QML_EXTS = new Set(['.qml']);

export async function executeQtMigration(cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const files = await collectFiles(base);
  const findings: MigrationFinding[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf-8');
    } catch {
      continue;
    }

    // Avoid scanning generated MOC/UIC files
    const baseName = file.replace(/\\/g, '/').split('/').pop() || '';
    if (baseName.startsWith('moc_') || baseName.startsWith('ui_') || baseName.startsWith('qrc_')) continue;

    const lines = content.split('\n');

    for (const rule of RULES) {
      // QML rules only apply to .qml files
      if (rule.category === 'QML' && !QML_EXTS.has(extname(file).toLowerCase())) continue;

      for (let i = 0; i < lines.length; i++) {
        // Skip comment lines for non-QML
        if (rule.category !== 'QML' && lines[i].trim().startsWith('//')) continue;

        const match = lines[i].match(rule.pattern);
        if (match) {
          // Filter false positives for common patterns
          if (rule.old === 'QMediaPlayer' && lines[i].includes('#include')) continue;
          if (rule.old === 'QRegExp' && lines[i].includes('QRegularExpression')) continue;

          findings.push({
            file: relative(base, file).replace(/\\/g, '/'),
            line: i + 1,
            snippet: lines[i].trim().slice(0, 120),
            category: rule.category,
            old: rule.old,
            replacement: rule.replacement,
            severity: rule.severity,
          });
        }
      }
    }
  }

  // Deduplicate findings per file+line
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.old}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    return 'No Qt5 → Qt6 migration issues found. The codebase appears to be Qt6-compatible or already migrated.';
  }

  const lines: string[] = [];
  lines.push(`## Qt5 → Qt6 Migration Check (${unique.length} findings)\n`);

  // Group by severity
  const errors = unique.filter((f) => f.severity === 'error');
  const warnings = unique.filter((f) => f.severity === 'warning');
  const infos = unique.filter((f) => f.severity === 'info');

  if (errors.length > 0) {
    lines.push(`### Errors (${errors.length}) — will not compile in Qt6:`);
    for (const f of errors) {
      lines.push(`  - **${f.file}:${f.line}** — \`${f.old}\``);
      lines.push(`    → use \`${f.replacement}\``);
      lines.push(`    \`\`\`\n    ${f.snippet}\n    \`\`\``);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(`### Warnings (${warnings.length}) — API changes, may need attention:`);
    for (const f of warnings) {
      lines.push(`  - **${f.file}:${f.line}** — \`${f.old}\``);
      lines.push(`    → use \`${f.replacement}\``);
    }
    lines.push('');
  }

  if (infos.length > 0) {
    lines.push(`### Info (${infos.length}) — minor changes to be aware of:`);
    for (const f of infos) {
      lines.push(`  - **${f.file}:${f.line}** [${f.category}] \`${f.old}\``);
    }
    lines.push('');
  }

  // Summary by category
  const categories = new Map<string, number>();
  for (const f of unique) categories.set(f.category, (categories.get(f.category) || 0) + 1);
  lines.push('### By Category');
  for (const [cat, count] of [...categories].sort((a, b) => b[1] - a[1])) {
    lines.push(`  - ${cat}: ${count}`);
  }

  if (errors.length > 0) {
    lines.push(
      `\n> ${errors.length} error(s) must be fixed before building with Qt6. Warnings and info items should be reviewed.`,
    );
  }

  return lines.join('\n');
}

async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'build', 'dist', '3rdparty', 'third_party']);

  async function walk(d: string) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skip.has(entry.name)) {
          await walk(full);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SOURCE_EXTS.has(ext) || QML_EXTS.has(ext)) {
          results.push(full);
        }
      }
    }
  }

  await walk(dir);
  return results;
}
