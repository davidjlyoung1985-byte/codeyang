/**
 * QtTestGen — Generate QTest unit test code from C++ header files.
 * Parses class declarations to produce a skeleton test suite covering:
 *   - Construction / destruction
 *   - Public methods (normal, edge-case)
 *   - Signals and slots (with QSignalSpy)
 *   - Properties (Q_PROPERTY read/write/notify)
 *   - Invokable methods (Q_INVOKABLE)
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

interface ClassInfo {
  className: string;
  baseClass: string;
  hasQObject: boolean;
  constructors: string[];
  publicMethods: MethodInfo[];
  publicSlots: MethodInfo[];
  signals: SignalInfo[];
  properties: PropertyInfo[];
  invokables: string[];
  fileName: string;
}

interface MethodInfo {
  name: string;
  signature: string;
  returnType: string;
  params: ParamInfo[];
  isConst: boolean;
}

interface SignalInfo {
  name: string;
  params: ParamInfo[];
}

interface PropertyInfo {
  type: string;
  name: string;
  hasRead: boolean;
  hasWrite: boolean;
  hasNotify: boolean;
  notifySignal: string;
}

interface ParamInfo {
  type: string;
  name: string;
  defaultValue: string;
}

export async function executeQtTestGen(headerPath?: string, cwd?: string): Promise<string> {
  const base = cwd || process.cwd();

  let files: string[] = [];
  if (headerPath) {
    files = [headerPath.startsWith('/') || headerPath.match(/^[A-Za-z]:/) ? headerPath : join(base, headerPath)];
  } else {
    files = await findHeaders(base);
  }

  if (files.length === 0) return 'No C++ header files found. Specify a header file path.';

  const results: string[] = [];
  results.push(`## QTest Generator — ${files.length} header(s)\n`);

  for (const file of files.slice(0, 5)) {
    // Limit to 5 files to avoid overwhelming output
    try {
      const content = await readFile(file, 'utf-8');
      const classes = parseClasses(file, content);
      for (const ci of classes) {
        if (ci.hasQObject || ci.signals.length > 0 || ci.publicSlots.length > 0) {
          results.push(generateTestCode(ci, base));
        }
      }
    } catch {
      results.push(`⚠ Could not parse: ${relative(base, file)}\n`);
    }
  }

  if (files.length > 5) {
    results.push(`\n> Showing first 5 files. ${files.length - 5} more available. Use QtTestGen with a specific header path.`);
  }

  return results.join('\n');
}

async function findHeaders(dir: string): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'build', 'dist', 'moc_', 'ui_']);
  async function walk(d: string) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skip.has(entry.name)) await walk(full);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (['.h', '.hpp'].includes(ext) && !entry.name.startsWith('moc_') && !entry.name.startsWith('ui_')) {
          results.push(full);
        }
      }
    }
  }
  await walk(dir);
  return results;
}

function parseClasses(filePath: string, content: string): ClassInfo[] {
  const classes: ClassInfo[] = [];

  // Find class declarations
  const simpleRegex = /class\s+(\w+)\s*(?::\s*public\s+(\w+))?\s*\{/g;
  let cm;
  while ((cm = simpleRegex.exec(content)) !== null) {
    const className = cm[1];
    const baseClass = cm[2] || '';

    // Extract class body (simplified — finds matching brace)
    const startIdx = cm.index + cm[0].length;
    let depth = 1;
    let endIdx = startIdx;
    for (let i = startIdx; i < content.length && depth > 0; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      if (depth === 0) endIdx = i + 1;
    }
    const body = content.slice(startIdx, endIdx);

    const ci: ClassInfo = {
      className,
      baseClass,
      hasQObject: body.includes('Q_OBJECT'),
      constructors: [],
      publicMethods: [],
      publicSlots: [],
      signals: [],
      properties: [],
      invokables: [],
      fileName: relative(process.cwd(), filePath).replace(/\\/g, '/'),
    };

    // Parse Q_PROPERTY
    const propRegex = /Q_PROPERTY\s*\(\s*(\w+)\s+(\w+)\s*(READ\s+(\w+))?\s*(WRITE\s+(\w+))?\s*(NOTIFY\s+(\w+))?\s*\)/g;
    let pm;
    while ((pm = propRegex.exec(body)) !== null) {
      ci.properties.push({
        type: pm[1],
        name: pm[2],
        hasRead: !!pm[3],
        hasWrite: !!pm[5],
        hasNotify: !!pm[7],
        notifySignal: pm[8] || '',
      });
    }

    // Parse signals: section
    const signalsSection = extractSection(body, 'signals');
    if (signalsSection) {
      const sigs = parseMethodDeclarations(signalsSection);
      for (const s of sigs) {
        ci.signals.push({ name: s.name, params: s.params });
      }
    }

    // Parse public slots: section
    const slotsSection = extractSection(body, 'public slots');
    if (slotsSection) {
      ci.publicSlots = parseMethodDeclarations(slotsSection);
    }

    // Parse public: section (methods only, skip signals/slots already covered)
    const publicSection = extractSection(body, 'public');
    if (publicSection) {
      const methods = parseMethodDeclarations(publicSection);
      // Filter out Q_INVOKABLE, constructors, destructors
      for (const m of methods) {
        if (m.name.startsWith('~')) continue;
        if (m.name === className) {
          ci.constructors.push(m.signature);
          continue;
        }
        if (publicSection.includes(`Q_INVOKABLE ${m.signature}`) || publicSection.includes(`Q_INVOKABLE\n${m.signature}`)) {
          ci.invokables.push(m.name);
        }
        ci.publicMethods.push(m);
      }
    }

    classes.push(ci);
  }

  return classes;
}

/** Extract code between access specifier labels */
function extractSection(body: string, label: string): string | null {
  // Stop at next access label (with optional "slots") or closing brace
  const accessLabels = '(?:signals|Q_SIGNALS|public|private|protected|Q_SLOTS)';
  const pattern = new RegExp(
    `${label}\\s*:([\\s\\S]*?)(?=\\n\\s*(?:${accessLabels}(?:\\s+slots)?\\s*:|\\}))`,
    'im',
  );
  const m = body.match(pattern);
  return m ? m[1] : null;
}

/** Parse method declarations from a section body */
function parseMethodDeclarations(section: string): MethodInfo[] {
  const methods: MethodInfo[] = [];
  const lines = section.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('Q_') || trimmed.startsWith('#') || !trimmed.endsWith(';')) continue;

    // Skip access labels, macro lines
    if (/^(public|private|protected|signals|Q_SIGNALS|Q_SLOTS)\b/.test(trimmed)) continue;

    // Match: [qualifiers] returnType methodName(params) [const] [override];
    const match = trimmed.match(
      /^(?:virtual\s+)?(?:static\s+)?(?:inline\s+)?(?:explicit\s+)?(\S+(?:\s*[*&<>,:\w]+)?)\s+(\w+)\s*\(([^)]*)\)\s*(const)?\s*(?:override\s*)?;\s*$/,
    );
    if (!match) continue;

    const returnType = match[1].trim();
    const name = match[2];
    // Filter out keywords that look like method names
    if (['if', 'while', 'for', 'switch', 'return', 'case', 'else', 'new', 'delete'].includes(name)) continue;

    // match[3] = params string, match[4] = "const" if present
    const isConst = match[4] === 'const';
    const params = parseParams(match[3] || '');

    methods.push({ name, signature: trimmed.replace(/\s*;\s*$/, ''), returnType, params, isConst });
  }

  return methods;
}

function parseParams(paramStr: string): ParamInfo[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(',').map((p) => {
    const defIdx = p.indexOf('=');
    const defaultValue = defIdx >= 0 ? p.slice(defIdx + 1).trim() : '';
    const typePart = defIdx >= 0 ? p.slice(0, defIdx).trim() : p.trim();
    const typePieces = typePart.split(/\s+/);
    const paramName = typePieces.pop() || '';
    const paramType = typePieces.join(' ') || 'int';
    return { type: paramType, name: paramName, defaultValue };
  });
}

// ─── Code Generation ─────────────────────────────────────────────────────────

function generateTestCode(ci: ClassInfo, _base: string): string {
  const lines: string[] = [];
  const testClassName = `tst_${ci.className}`;

  lines.push(`### Test: ${ci.className} → ${testClassName}`);
  lines.push(`Source: ${ci.fileName}\n`);

  lines.push('```cpp');
  lines.push(`#include <QtTest>`);
  lines.push(`#include "${ci.fileName}"`);
  lines.push('');

  // Test class declaration
  lines.push(`class ${testClassName} : public QObject`);
  lines.push('{');
  lines.push('    Q_OBJECT');
  lines.push('');

  // Private slots — test methods
  lines.push('private slots:');

  // Constructor test
  if (ci.constructors.length > 0) {
    lines.push(`    void initTestCase();`);
    lines.push(`    void cleanupTestCase();`);
  }
  lines.push(`    void testConstructor();`);

  // Method tests
  for (const m of ci.publicMethods) {
    lines.push(`    void test_${m.name}();`);
  }

  // Slot tests
  for (const s of ci.publicSlots) {
    lines.push(`    void test_slot_${s.name}();`);
  }

  // Signal tests
  for (const s of ci.signals) {
    lines.push(`    void test_signal_${s.name}();`);
  }

  // Property tests
  for (const p of ci.properties) {
    if (p.hasRead) lines.push(`    void test_property_${p.name}_read();`);
    if (p.hasWrite) lines.push(`    void test_property_${p.name}_write();`);
    if (p.hasNotify) lines.push(`    void test_property_${p.name}_notify();`);
  }

  // Invokable tests
  for (const inv of ci.invokables) {
    lines.push(`    void test_invokable_${inv}();`);
  }

  lines.push('};');
  lines.push('');
  lines.push('// ─── Implementation ────────────────────────────────────────');
  lines.push('');

  // initTestCase
  if (ci.constructors.length > 0) {
    lines.push(`void ${testClassName}::initTestCase()`);
    lines.push('{');
    lines.push(`    // Setup code before all tests`);
    lines.push(`    qDebug() << "${testClassName} starting...";`);
    lines.push('}');
    lines.push('');
  }

  // testConstructor
  lines.push(`void ${testClassName}::testConstructor()`);
  lines.push('{');
  lines.push(`    ${ci.className} obj;`);
  if (ci.baseClass) {
    lines.push(`    // Inherits from ${ci.baseClass}`);
  }
  if (ci.hasQObject) {
    lines.push(`    QVERIFY(obj.isWidgetType() || obj.isWindowType() || true); // QObject created`);
    lines.push(`    QCOMPARE(obj.parent(), nullptr);`);
  }
  lines.push('}');
  lines.push('');

  // Generate default values for each param type
  const defaultValue = (t: string) => {
    if (t === 'int' || t === 'qint64' || t === 'uint') return '0';
    if (t === 'double' || t === 'float' || t === 'qreal') return '0.0';
    if (t === 'bool') return 'false';
    if (t === 'QString') return 'QStringLiteral("test")';
    if (t === 'QByteArray') return 'QByteArrayLiteral("test")';
    if (t === 'QUrl') return 'QUrl("http://test.local")';
    if (t.includes('*')) return 'nullptr';
    return `${t}()`;
  };

  // Method test stubs
  for (const m of ci.publicMethods) {
    lines.push(`void ${testClassName}::test_${m.name}()`);
    lines.push('{');
    lines.push(`    ${ci.className} obj;`);

    // Call the method
    const args = m.params.map((p) => defaultValue(p.type)).join(', ');
    if (m.returnType !== 'void') {
      lines.push(`    ${m.returnType} result = obj.${m.name}(${args});`);
      lines.push('    // Verify result — replace with real assertions');
      lines.push('    QVERIFY(true);');
    } else {
      lines.push(`    obj.${m.name}(${args});`);
      lines.push('    QVERIFY(true); // Replace with real assertions');
    }
    lines.push('}');
    lines.push('');
  }

  // Slot test stubs
  for (const s of ci.publicSlots) {
    lines.push(`void ${testClassName}::test_slot_${s.name}()`);
    lines.push('{');
    lines.push(`    ${ci.className} obj;`);

    if (s.params.length === 0) {
      lines.push(`    obj.${s.name}();`);
      lines.push('    QVERIFY(true); // Verify slot side-effects');
    } else {
      lines.push(`    // Slot has parameters — trigger via signal or call directly`);
      lines.push('    QVERIFY(true);');
    }
    lines.push('}');
    lines.push('');
  }

  // Signal test stubs
  for (const s of ci.signals) {
    lines.push(`void ${testClassName}::test_signal_${s.name}()`);
    lines.push('{');
    lines.push(`    ${ci.className} obj;`);
    lines.push(`    QSignalSpy spy(&obj, &${ci.className}::${s.name});`);
    lines.push(`    QVERIFY(spy.isValid());`);
    lines.push('');
    lines.push('    // Trigger the signal — replace with actual trigger logic');
    lines.push('    // emit obj.' + s.name + '(' + s.params.map((p) => defaultValue(p.type)).join(', ') + ');');
    lines.push('    // QCOMPARE(spy.count(), 1);');
    lines.push('}');
    lines.push('');
  }

  // Property tests
  for (const p of ci.properties) {
    if (p.hasRead) {
      lines.push(`void ${testClassName}::test_property_${p.name}_read()`);
      lines.push('{');
      lines.push(`    ${ci.className} obj;`);
      lines.push(`    QCOMPARE(obj.property("${p.name}").type(), QVariant::${qtTypeToQvariant(p.type)});`);
      lines.push('}');
      lines.push('');
    }
    if (p.hasWrite) {
      lines.push(`void ${testClassName}::test_property_${p.name}_write()`);
      lines.push('{');
      lines.push(`    ${ci.className} obj;`);
      lines.push(`    ${p.type} testVal${defaultValue(p.type)};`);
      lines.push(`    QVERIFY(obj.setProperty("${p.name}", QVariant::fromValue(testVal)));`);
      lines.push('}');
      lines.push('');
    }
    if (p.hasNotify && p.notifySignal) {
      lines.push(`void ${testClassName}::test_property_${p.name}_notify()`);
      lines.push('{');
      lines.push(`    ${ci.className} obj;`);
      lines.push(`    QSignalSpy spy(&obj, &${ci.className}::${p.notifySignal});`);
      lines.push(`    QVERIFY(spy.isValid());`);
      lines.push('    // Change property and verify spy.count() == 1');
      lines.push('}');
      lines.push('');
    }
  }

  // main()
  lines.push('// ─── QTest Main ──────────────────────────────────────────');
  lines.push(`QTEST_MAIN(${testClassName})`);
  lines.push(`#include "${ci.fileName.replace('.h', '.moc')}"`);

  lines.push('```\n');

  // Test plan summary
  const totalTests = 1 + ci.publicMethods.length + ci.publicSlots.length + ci.signals.length +
    ci.properties.filter((p) => p.hasRead).length +
    ci.properties.filter((p) => p.hasWrite).length +
    ci.properties.filter((p) => p.hasNotify).length +
    ci.invokables.length;

  lines.push(`**Generated test plan**: ${totalTests} test methods`);
  lines.push(`- Constructor: 1`);
  if (ci.publicMethods.length) lines.push(`- Public methods: ${ci.publicMethods.length} (${ci.publicMethods.map((m) => m.name).join(', ')})`);
  if (ci.publicSlots.length) lines.push(`- Public slots: ${ci.publicSlots.length} (${ci.publicSlots.map((s) => s.name).join(', ')})`);
  if (ci.signals.length) lines.push(`- Signals (QSignalSpy): ${ci.signals.length} (${ci.signals.map((s) => s.name).join(', ')})`);
  if (ci.properties.length) lines.push(`- Properties: ${ci.properties.length} (${ci.properties.map((p) => p.name).join(', ')})`);
  if (ci.invokables.length) lines.push(`- Q_INVOKABLE: ${ci.invokables.join(', ')}`);

  lines.push(`\n> Add this file to your .pro: \`SOURCES += tst_${ci.className.toLowerCase()}.cpp\``);
  lines.push(`> Or CMake: \`qt_add_test(${ci.className}Test tst_${ci.className.toLowerCase()}.cpp)\``);
  lines.push('');

  return lines.join('\n');
}

function qtTypeToQvariant(type: string): string {
  switch (type) {
    case 'int': return 'Int';
    case 'double': case 'float': case 'qreal': return 'Double';
    case 'bool': return 'Bool';
    case 'QString': return 'String';
    case 'QByteArray': return 'ByteArray';
    case 'QUrl': return 'Url';
    case 'QColor': return 'Color';
    case 'QDate': return 'Date';
    case 'QTime': return 'Time';
    default: return 'UserType';
  }
}
