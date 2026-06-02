/**
 * Qt project detector — fast filesystem scan to determine if CWD is a Qt project.
 * Runs once at startup. Used to conditionally inject Qt knowledge and tools.
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

/**
 * Scan `cwd` (non-recursive) for Qt project markers.
 * Returns a QtContext describing what was found.
 */
export async function detectQtProject(cwd: string): Promise<QtContext> {
  const ctx: QtContext = { isQtProject: false, hasUiFiles: false, hasQrcFiles: false };

  let entries;
  try {
    entries = await readdir(cwd, { withFileTypes: true, recursive: false });
  } catch {
    return ctx;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;

    // .pro files → qmake project
    if (name.endsWith('.pro')) {
      ctx.isQtProject = true;
      ctx.buildSystem = 'qmake';
      ctx.proFile = name;
      try {
        ctx.qtVersion = await detectQtVersionFromPro(join(cwd, name));
      } catch {
        // ignore parse errors
      }
    }

    // .pri files included by .pro (don't set buildSystem on their own)
    if (name.endsWith('.pri')) {
      ctx.isQtProject = true;
    }

    // CMakeLists.txt with Qt indicators
    if (name === 'CMakeLists.txt') {
      ctx.cmakeFile = name;
      try {
        const content = await readFile(join(cwd, name), 'utf-8');
        if (
          content.includes('find_package(Qt') ||
          content.includes('QT_') ||
          content.includes('qt_') ||
          content.includes('AUTOMOC') ||
          content.includes('Qt')
        ) {
          ctx.isQtProject = true;
          if (!ctx.buildSystem) ctx.buildSystem = 'cmake';
          ctx.qtVersion = detectQtVersionFromCmake(content) || ctx.qtVersion;
        }
      } catch {
        // ignore
      }
    }

    // .ui files → Qt Designer forms
    if (name.endsWith('.ui')) ctx.hasUiFiles = true;

    // .qrc files → Qt resource files
    if (name.endsWith('.qrc')) ctx.hasQrcFiles = true;
  }

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
