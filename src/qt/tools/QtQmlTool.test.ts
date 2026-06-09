import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeQtQml } from './QtQmlTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-qml-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createFile(name: string, content: string): Promise<string> {
  const p = join(tempDir, name);
  try {
    await mkdir(dirname(p), { recursive: true });
  } catch {}
  await writeFile(p, content, 'utf-8');
  return p;
}

// ──────────────────────────────────────────────
// QtQml Tool — QML file analysis
// ──────────────────────────────────────────────

describe('QtQmlTool', () => {
  describe('Import detection', () => {
    it('detects versioned QtQuick import as warning', async () => {
      await createFile(
        'app.qml',
        'import QtQuick 2.15\nimport QtQuick.Controls 2.5\n\nRectangle { width: 100; height: 100 }',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('QML Analysis');
      expect(r).toContain('Versioned import');
      expect(r).toContain('QtQuick 2.15');
    });

    it('detects QtQuick.Controls 1.x as warning (removed in Qt6)', async () => {
      await createFile('oldcontrols.qml', 'import QtQuick.Controls 1.4\nButton { }');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('QtQuick.Controls 1');
      expect(r).toContain('removed in Qt6');
    });

    it('detects deprecated QtGraphicalEffects import', async () => {
      await createFile('fx.qml', 'import QtGraphicalEffects 1.0\nRectangle { }');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('QtGraphicalEffects');
      expect(r).toContain('deprecated');
    });

    it('reports imports section in output', async () => {
      await createFile('imports.qml', 'import QtQuick 2.15\nimport QtQuick.Controls 2.5\nItem { }');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('Imports');
    });
  });

  describe('Component detection', () => {
    it('lists component types used in QML', async () => {
      await createFile(
        'comps.qml',
        'import QtQuick 2.15\nRectangle {\n  Button {}\n  Text {}\n  TextInput {}\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('Components');
      expect(r).toContain('Rectangle');
      expect(r).toContain('Text');
    });

    it('reports count for each component type', async () => {
      await createFile(
        'multi.qml',
        'import QtQuick 2.15\nItem {\n  Button {}\n  Button {}\n  Label {}\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('Components');
      expect(r).toContain('Button');
    });
  });

  describe('Anti-pattern detection', () => {
    it('detects anchors + x property conflict', async () => {
      await createFile(
        'anchorx.qml',
        'import QtQuick 2.15\nRectangle {\n  anchors.left: parent.left; x: 20\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('anchors');
      expect(r).toContain('override');
    });

    it('detects anchors + x property conflict on same line as y', async () => {
      await createFile(
        'anchory.qml',
        'import QtQuick 2.15\nRectangle {\n  anchors.right: parent.right; x: 10\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('anchors');
      expect(r).toContain('override');
    });

    it('warns about missing id on top-level component', async () => {
      await createFile(
        'noid.qml',
        'import QtQuick 2.15\nRectangle {\n  width: 100\n  height: 100\n  color: "red"\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('lacks an id');
    });

    it('does not warn when id is present', async () => {
      await createFile(
        'withid.qml',
        'import QtQuick 2.15\nRectangle {\n  id: root\n  width: 100\n  height: 100\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).not.toContain('lacks an id');
    });

    it('detects deeply nested components (>16 spaces indent)', async () => {
      await createFile(
        'deep.qml',
        'import QtQuick 2.15\nRectangle {\n                    Item {\n                    }\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('Deeply nested');
    });
  });

  describe('C++ integration detection', () => {
    it('detects qmlRegisterType calls in C++ Integration section', async () => {
      await createFile('register.qml', '// qmlRegisterType<MyClass>("MyModule", 1, 0, "MyClass");\nimport QtQuick 2.15\nRectangle {}');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('C++ Integration');
      expect(r).toContain('qmlRegisterType');
    });

    it('detects QML_ELEMENT usage in C++ Integration section', async () => {
      await createFile(
        'integration.qml',
        '// QML_ELEMENT\nimport QtQuick 2.15\nRectangle { }',
      );
      const r = await executeQtQml(tempDir);
      // The tool looks for registerType|qmlRegisterType|QML_ELEMENT|QML_NAMED_ELEMENT
      expect(r).toContain('C++ Integration');
      expect(r).toContain('QML_ELEMENT');
    });
  });

  describe('File handling', () => {
    it('reports multiple files in directory', async () => {
      await createFile('a.qml', 'import QtQuick 2.15\nItem { }');
      await createFile('b.qml', 'import QtQuick 2.15\nRectangle { }');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('2 file(s)');
    });

    it('reports total line count', async () => {
      await createFile(
        'lines.qml',
        'import QtQuick 2.15\nItem {\n  width: 100\n  height: 100\n}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('lines');
    });

    it('handles empty QML directory gracefully', async () => {
      const r = await executeQtQml(tempDir);
      expect(r).toContain('No QML files');
    });

    it('handles non-existent directory gracefully', async () => {
      const r = await executeQtQml(join(tempDir, 'void'));
      expect(r).toContain('No QML files');
    });

    it('skips non-QML files', async () => {
      await createFile('notqml.txt', 'import QtQuick 2.15\nItem { }');
      await createFile('notqml.js', 'var x = 1;');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('No QML files');
    });

    it('processes .qml files in subdirectories', async () => {
      await createFile('subdir/page.qml', 'import QtQuick 2.15\nPage { }');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('page.qml');
      expect(r).toContain('Page');
    });

    it('reports file path relative to cwd', async () => {
      await createFile('relative.qml', 'import QtQuick 2.15\nItem { }');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('relative.qml');
    });
  });

  describe('Warning and info summary', () => {
    it('includes summary with warning/info counts', async () => {
      await createFile(
        'summary.qml',
        'import QtQuick 2.15\nimport QtQuick.Controls 1.4\nimport QtGraphicalEffects 1.0\nItem {}',
      );
      const r = await executeQtQml(tempDir);
      expect(r).toContain('Summary');
      expect(r).toContain('warnings');
      expect(r).toContain('info');
    });

    it('marks versioned imports with ⚠ icon', async () => {
      await createFile('warn.qml', 'import QtQuick 2.15\nRectangle { }');
      const r = await executeQtQml(tempDir);
      expect(r).toContain('⚠');
    });
  });
});
