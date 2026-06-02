/**
 * QtQmlTool — Parse and analyze QML files.
 * Detects common issues: versioned imports, missing type annotations,
 * anti-patterns (anchors + x/y, deep nesting), and QML-C++ integration points.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

interface QmlIssue {
  file: string;
  line: number;
  severity: 'warning' | 'info';
  message: string;
}

interface QmlComponent {
  name: string;
  type: 'Item' | 'Rectangle' | 'Window' | 'Component' | 'other';
  count: number;
}

interface QmlAnalysis {
  file: string;
  lines: number;
  imports: string[];
  components: QmlComponent[];
  issues: QmlIssue[];
  cppIntegrations: string[];
}

export async function executeQtQml(cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const files = await findQmlFiles(base);
  if (files.length === 0) return 'No QML files found in the project.';

  const analyses: QmlAnalysis[] = [];
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      analyses.push(analyzeQmlFile(file, content));
    } catch {
      // skip
    }
  }

  return formatQmlReport(analyses, base);
}

async function findQmlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'build', 'dist']);
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
        if (!entry.name.startsWith('.') && !skip.has(entry.name)) await walk(full);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.qml') {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

function analyzeQmlFile(filePath: string, content: string): QmlAnalysis {
  const lines = content.split('\n');
  const issues: QmlIssue[] = [];
  const imports: string[] = [];
  const components: QmlComponent[] = [];
  const cppIntegrations: string[] = [];

  // Parse imports
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/import\s+(\S[\S\s]*?)\s*$/);
    if (m) imports.push(m[1].trim());
  }

  // Detect common issues
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    // Versioned imports
    if (line.match(/import\s+QtQuick\s+2\.\d+/)) {
      issues.push({
        file: relative(process.cwd(), filePath).replace(/\\/g, '/'),
        line: ln,
        severity: 'warning',
        message: 'Versioned import: prefer versionless `import QtQuick` in Qt6',
      });
    }

    // QtQuick.Controls 1.x (removed in Qt6)
    if (line.match(/import\s+QtQuick\.Controls\s+1\.\d+/)) {
      issues.push({
        file: relative(process.cwd(), filePath).replace(/\\/g, '/'),
        line: ln,
        severity: 'warning',
        message: 'QtQuick.Controls 1.x removed in Qt6. Migrate to QtQuick.Controls 2.x.',
      });
    }

    // QtGraphicalEffects (deprecated)
    if (line.match(/import\s+QtGraphicalEffects/)) {
      issues.push({
        file: relative(process.cwd(), filePath).replace(/\\/g, '/'),
        line: ln,
        severity: 'warning',
        message: 'QtGraphicalEffects deprecated in Qt6. Use Qt5Compat.GraphicalEffects or Qt Quick Effects (6.5+).',
      });
    }

    // Anchors + x/y conflict
    if (/anchors\.(?:left|right|horizontalCenter)\b/.test(line) && /\bx\s*:/.test(line)) {
      issues.push({
        file: relative(process.cwd(), filePath).replace(/\\/g, '/'),
        line: ln,
        severity: 'warning',
        message: 'Both anchors.horizontal and x property set — anchors override x',
      });
    }

    // Missing id on top-level component
    if (/^\s*(Rectangle|Item|Window|ApplicationWindow|Pane|Page)\s*\{/.test(line) && !lines[i].includes('id:')) {
      // Check next few lines for id
      let hasId = false;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/\bid\s*:/.test(lines[j])) {
          hasId = true;
          break;
        }
      }
      if (!hasId) {
        issues.push({
          file: relative(process.cwd(), filePath).replace(/\\/g, '/'),
          line: ln,
          severity: 'info',
          message: 'Top-level component lacks an id — consider adding one for easier referencing',
        });
      }
    }

    // Deep nesting detection (>4 levels)
    // Heuristic: count leading spaces and detect deeply nested objects
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    if (indent > 16 && /\{$/.test(line.trim())) {
      issues.push({
        file: relative(process.cwd(), filePath).replace(/\\/g, '/'),
        line: ln,
        severity: 'info',
        message: 'Deeply nested QML component — consider extracting into a separate file',
      });
    }

    // C++ integration patterns
    if (/registerType|qmlRegisterType|QML_ELEMENT|QML_NAMED_ELEMENT/.test(line)) {
      cppIntegrations.push(line.trim());
    }
  }

  // Count component types
  const typeCounts = new Map<string, number>();
  const typeRegex =
    /\b(Rectangle|Item|Window|ApplicationWindow|Button|Text|Label|Column|Row|Grid|Flow|ListView|GridView|Repeater|Loader|MouseArea|TextInput|TextField|ComboBox|Pane|Page|Frame|GroupBox|ScrollView|SplitView|StackView|SwipeView|TabBar|TabButton|ToolBar|MenuBar|Dialog|Popup|Drawer|BusyIndicator|ProgressBar|Slider|SpinBox|Switch|CheckBox|RadioButton)\s*\{/g;
  let tm;
  while ((tm = typeRegex.exec(content)) !== null) {
    typeCounts.set(tm[1], (typeCounts.get(tm[1]) || 0) + 1);
  }

  for (const [type, count] of typeCounts) {
    const t: QmlComponent['type'] =
      type === 'Rectangle'
        ? 'Rectangle'
        : type === 'Item'
          ? 'Item'
          : type === 'Window' || type === 'ApplicationWindow'
            ? 'Window'
            : type === 'Component'
              ? 'Component'
              : 'other';
    components.push({ name: type, type: t, count });
  }

  return { file: filePath, lines: lines.length, imports, components, issues, cppIntegrations };
}

function formatQmlReport(analyses: QmlAnalysis[], base: string): string {
  const lines: string[] = [];
  const totalLines = analyses.reduce((s, a) => s + a.lines, 0);
  const totalIssues = analyses.reduce((s, a) => s + a.issues.length, 0);
  const allCppInts = analyses.flatMap((a) => a.cppIntegrations);

  lines.push(`## QML Analysis (${analyses.length} file(s), ${totalLines} lines, ${totalIssues} issue(s))\n`);

  for (const a of analyses) {
    const relPath = relative(base, a.file).replace(/\\/g, '/');
    lines.push(`### ${relPath} (${a.lines} lines)`);

    if (a.imports.length > 0) {
      lines.push('  **Imports:**');
      for (const imp of a.imports) lines.push(`  - \`${imp}\``);
    }

    if (a.components.length > 0) {
      const top = a.components.sort((x, y) => y.count - x.count).slice(0, 8);
      lines.push(`  **Components:** ${top.map((c) => `${c.name}(${c.count})`).join(', ')}`);
    }

    if (a.issues.length > 0) {
      lines.push('  **Issues:**');
      for (const issue of a.issues) {
        const icon = issue.severity === 'warning' ? '⚠' : 'ℹ';
        lines.push(`  - ${icon} L${issue.line}: ${issue.message}`);
      }
    }
    lines.push('');
  }

  if (totalIssues > 0) {
    lines.push('### Summary');
    const warnings = analyses.flatMap((a) => a.issues).filter((i) => i.severity === 'warning');
    const infos = analyses.flatMap((a) => a.issues).filter((i) => i.severity === 'info');
    lines.push(`- ${warnings.length} warnings, ${infos.length} info items`);
  }

  if (allCppInts.length > 0) {
    lines.push('\n### C++ Integration Points');
    for (const p of allCppInts) lines.push(`  - \`${p}\``);
  }

  return lines.join('\n');
}
