/**
 * QtUiTool — Parse Qt Designer .ui XML files.
 * Reads widget hierarchy, object names, layouts, and signal-slot connections defined in the UI.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

interface WidgetInfo {
  className: string;
  objectName: string;
  parent: string;
  geometry?: { x: number; y: number; w: number; h: number };
  children: WidgetInfo[];
}

interface UiConnection {
  sender: string;
  signal: string;
  receiver: string;
  slot: string;
}

interface UiAnalysis {
  filePath: string;
  widgetCount: number;
  rootWidget: WidgetInfo | null;
  connections: UiConnection[];
  customWidgets: string[];
  includes: string[];
  resources: string[];
}

export async function executeQtUi(uiPath?: string, cwd?: string): Promise<string> {
  const base = cwd || process.cwd();

  let files: string[] = [];
  if (uiPath) {
    const resolved = uiPath;
    files = [resolved];
  } else {
    files = await findUiFiles(base);
  }

  if (files.length === 0) return 'No .ui files found in the project.';

  const analyses: UiAnalysis[] = [];
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      analyses.push(parseUiFile(file, content));
    } catch {
      // skip unreadable files
    }
  }

  return formatUiReport(analyses, base);
}

async function findUiFiles(dir: string): Promise<string[]> {
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
      } else if (entry.isFile() && entry.name.endsWith('.ui')) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

function parseUiFile(filePath: string, content: string): UiAnalysis {
  const analysis: UiAnalysis = {
    filePath,
    widgetCount: 0,
    rootWidget: null,
    connections: [],
    customWidgets: [],
    includes: [],
    resources: [],
  };

  // Parse with regex (lightweight, no XML parser needed for structure)
  // Find widget elements
  const widgetRegex = /<widget\s+class="([^"]+)"\s+name="([^"]*)"/g;
  const widgets: Array<{ className: string; objectName: string }> = [];
  let wm;
  while ((wm = widgetRegex.exec(content)) !== null) {
    widgets.push({ className: wm[1], objectName: wm[2] });
  }

  analysis.widgetCount = widgets.length;

  // Parse connections
  const connRegex =
    /<connection>\s*<sender>([^<]+)<\/sender>\s*<signal>([^<]+)<\/signal>\s*<receiver>([^<]+)<\/receiver>\s*<slot>([^<]+)<\/slot>\s*<\/connection>/g;
  let cm;
  while ((cm = connRegex.exec(content)) !== null) {
    analysis.connections.push({
      sender: cm[1].trim(),
      signal: cm[2].trim(),
      receiver: cm[3].trim(),
      slot: cm[4].trim(),
    });
  }

  // Parse custom widgets
  const customRegex = /<customwidget>\s*<class>([^<]+)<\/class>/g;
  let cwm;
  while ((cwm = customRegex.exec(content)) !== null) {
    analysis.customWidgets.push(cwm[1]);
  }

  // Parse includes
  const includeRegex = /<include\s+location="([^"]+)">([^<]+)<\/include>/g;
  let im;
  while ((im = includeRegex.exec(content)) !== null) {
    analysis.includes.push(im[2]);
  }

  // Parse resources
  const resourceRegex = /<resources>\s*<include\s+location="([^"]+)"/g;
  let rm;
  while ((rm = resourceRegex.exec(content)) !== null) {
    analysis.resources.push(rm[1]);
  }

  return analysis;
}

function formatUiReport(analyses: UiAnalysis[], base: string): string {
  const lines: string[] = [];
  const totalWidgets = analyses.reduce((sum, a) => sum + a.widgetCount, 0);
  const totalConns = analyses.reduce((sum, a) => sum + a.connections.length, 0);

  lines.push(`## UI File Analysis (${analyses.length} file(s), ${totalWidgets} widgets, ${totalConns} connections)\n`);

  for (const a of analyses) {
    const relPath = relative(base, a.filePath).replace(/\\/g, '/');
    lines.push(`### ${relPath}`);
    lines.push(`- Widgets: ${a.widgetCount}`);
    if (a.connections.length > 0) lines.push(`- Connections: ${a.connections.length}`);
    if (a.customWidgets.length > 0) lines.push(`- Custom widgets: ${a.customWidgets.join(', ')}`);
    if (a.includes.length > 0) lines.push(`- Includes: ${a.includes.join(', ')}`);
    if (a.resources.length > 0) lines.push(`- Resources: ${a.resources.join(', ')}`);

    if (a.connections.length > 0) {
      lines.push('\n  **Signal-Slot Connections (in .ui):**');
      for (const c of a.connections) {
        lines.push(`  - \`${c.sender}\`::\`${c.signal}()\` → \`${c.receiver}\`::\`${c.slot}()\``);
      }
    }
    lines.push('');
  }

  // Code generation hints
  lines.push('### Code Generation');
  lines.push(
    'When modifying .ui files, run `uic` to regenerate `ui_*.h` headers. The agent should NOT manually edit `ui_*.h` files — they are auto-generated.',
  );
  lines.push(
    'In qmake, list .ui files in `FORMS`. In CMake, set `CMAKE_AUTOUIC ON` and list .ui files alongside sources.',
  );

  return lines.join('\n');
}
