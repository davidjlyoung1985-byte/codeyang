/**
 * Qt project detector — fast filesystem scan to determine if CWD is a Qt project.
 * Runs once at startup. Used to conditionally inject Qt knowledge and tools.
 *
 * Scans the root directory plus up to 2 subdirectory levels for Qt project markers,
 * to detect projects where build files live in subdirectories (e.g. src/, app/).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface QtContext {
  isQtProject: boolean;
  qtVersion?: string;
  buildSystem?: 'qmake' | 'cmake' | 'qbs';
  hasUiFiles: boolean;
  hasQrcFiles: boolean;
  proFile?: string;
  cmakeFile?: string;
}

/** 最多扫描的目录深度（根目录 + 2 层子目录） */
const MAX_SCAN_DEPTH = 2;

// 不递归扫描的目录
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  '.cache',
  '__pycache__',
  '3rdparty',
  'third_party',
]);

/** 检查单个文件是否为 Qt 项目标记，更新 ctx 状态 */
async function checkFileForQt(name: string, fullPath: string, cwd: string, ctx: QtContext): Promise<void> {
  // .pro files → qmake project
  if (name.endsWith('.pro')) {
    ctx.isQtProject = true;
    ctx.buildSystem = 'qmake';
    ctx.proFile = fullPath;
    try {
      ctx.qtVersion = await detectQtVersionFromPro(fullPath);
    } catch {
      // ignore parse errors
    }
    return;
  }

  // .pri files included by .pro
  if (name.endsWith('.pri')) {
    ctx.isQtProject = true;
    return;
  }

  // CMakeLists.txt with Qt indicators
  if (name === 'CMakeLists.txt') {
    ctx.cmakeFile = fullPath;
    try {
      const content = await readFile(fullPath, 'utf-8');
      if (
        content.includes('find_package(Qt') ||
        content.includes('find_package(QT') ||
        content.includes('QT_') ||
        content.includes('qt_') ||
        content.includes('AUTOMOC') ||
        content.includes('Qt') ||
        content.includes('Q_OBJECT')
      ) {
        ctx.isQtProject = true;
        if (!ctx.buildSystem) ctx.buildSystem = 'cmake';
        ctx.qtVersion = detectQtVersionFromCmake(content) || ctx.qtVersion;
      }
    } catch {
      // ignore
    }
    return;
  }

  // .qml files → Qt Quick project
  if (name.endsWith('.qml')) {
    ctx.isQtProject = true;
    return;
  }

  // .h files with Qt headers (quick check) — only check up to 3 files to avoid overhead
  if (name.match(/\.(h|hpp|hxx)$/i) && !ctx.isQtProject) {
    try {
      const content = await readFile(fullPath, 'utf-8');
      if (content.includes('#include <Q') || content.includes('#include <Qt')) {
        ctx.isQtProject = true;
      }
    } catch {
      /* ignore */
    }
    return;
  }

  // .ui files → Qt Designer forms
  if (name.endsWith('.ui')) {
    ctx.hasUiFiles = true;
    return;
  }

  // .qrc files → Qt resource files
  if (name.endsWith('.qrc')) {
    ctx.hasQrcFiles = true;
  }
}

/** 递归扫描目录，最大深度 MAX_SCAN_DEPTH */
async function scanDir(dir: string, cwd: string, ctx: QtContext, depth: number): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
        await scanDir(fullPath, cwd, ctx, depth + 1);
      }
    } else if (entry.isFile()) {
      await checkFileForQt(entry.name, fullPath, cwd, ctx);
    }
  }
}

/**
 * Scan `cwd` (recursively up to 2 levels) for Qt project markers.
 * Returns a QtContext describing what was found.
 */
export async function detectQtProject(cwd: string): Promise<QtContext> {
  const ctx: QtContext = { isQtProject: false, hasUiFiles: false, hasQrcFiles: false };

  await scanDir(cwd, cwd, ctx, 0);

  // If .ui or .qrc files exist without .pro/CMakeLists, it's still a Qt project
  if (!ctx.isQtProject && (ctx.hasUiFiles || ctx.hasQrcFiles)) {
    ctx.isQtProject = true;
  }

  return ctx;
}

async function detectQtVersionFromPro(proPath: string): Promise<string | undefined> {
  const content = await readFile(proPath, 'utf-8');
  // QT += ...  QT_VERSION = ...
  const versionMatch = content.match(/QT_VERSION\s*=\s*(\d+\.\d+\.\d+)/);
  if (versionMatch) return versionMatch[1];
  // Look for QT += quick (suggests Qt5+)
  if (/QT\s*\+=\s*.*\bquick\b/.test(content)) return '5.x+';
  return undefined;
}

function detectQtVersionFromCmake(content: string): string | undefined {
  // find_package(Qt6 ...)
  const qt6 = content.match(/find_package\s*\(\s*Qt6\b/);
  if (qt6) return '6.x';
  // find_package(Qt5 ...)
  const qt5 = content.match(/find_package\s*\(\s*Qt5\b/);
  if (qt5) return '5.x';
  // qt6_ or qt5_ prefix
  if (/\bqt6_/i.test(content)) return '6.x';
  if (/\bqt5_/i.test(content)) return '5.x';
  return undefined;
}
