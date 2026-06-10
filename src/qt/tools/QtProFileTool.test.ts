import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeQtProFile } from './QtProFileTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-pro-${randomUUID()}`);
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
// QtProFile Tool — .pro file parsing
// ──────────────────────────────────────────────

describe('QtProFileTool', () => {
  describe('Basic variable parsing', () => {
    it('parses QT modules from .pro', async () => {
      await createFile(
        'test.pro',
        'QT += core gui widgets\nTEMPLATE = app\nTARGET = myapp\nSOURCES += main.cpp widget.cpp\nHEADERS += widget.h\n',
      );
      const r = await executeQtProFile(join(tempDir, 'test.pro'), tempDir);
      expect(r).toContain('core');
      expect(r).toContain('gui');
      expect(r).toContain('widgets');
      expect(r).toContain('SOURCES');
      expect(r).toContain('HEADERS');
    });

    it('parses TEMPLATE variable', async () => {
      await createFile('templ.pro', 'TEMPLATE = lib\nQT += core\n');
      const r = await executeQtProFile(join(tempDir, 'templ.pro'), tempDir);
      expect(r).toContain('Template');
      expect(r).toContain('lib');
    });

    it('parses TARGET variable', async () => {
      await createFile('tgt.pro', 'TARGET = MyAwesomeApp\nQT += core\n');
      const r = await executeQtProFile(join(tempDir, 'tgt.pro'), tempDir);
      expect(r).toContain('Target');
      expect(r).toContain('MyAwesomeApp');
    });

    it('parses CONFIG values', async () => {
      await createFile('config.pro', 'QT += core\nCONFIG += qt warn_on release\nTEMPLATE = app\n');
      const r = await executeQtProFile(join(tempDir, 'config.pro'), tempDir);
      expect(r).toContain('CONFIG');
      expect(r).toContain('qt');
      expect(r).toContain('release');
    });
  });

  describe('Source and header parsing', () => {
    it('parses SOURCES list', async () => {
      await createFile('src.pro', 'QT += core widgets\nTEMPLATE = app\nSOURCES = main.cpp widget.cpp dialog.cpp\n');
      const r = await executeQtProFile(join(tempDir, 'src.pro'), tempDir);
      expect(r).toContain('SOURCES (3)');
      expect(r).toContain('main.cpp');
      expect(r).toContain('widget.cpp');
      expect(r).toContain('dialog.cpp');
    });

    it('parses HEADERS list', async () => {
      await createFile('hdr.pro', 'QT += core widgets\nTEMPLATE = app\nHEADERS = widget.h dialog.h\n');
      const r = await executeQtProFile(join(tempDir, 'hdr.pro'), tempDir);
      expect(r).toContain('HEADERS');
      expect(r).toContain('widget.h');
      expect(r).toContain('dialog.h');
    });

    it('parses FORMS list', async () => {
      await createFile('forms.pro', 'QT += core widgets\nTEMPLATE = app\nFORMS = mainwindow.ui dialog.ui\n');
      const r = await executeQtProFile(join(tempDir, 'forms.pro'), tempDir);
      expect(r).toContain('FORMS');
      expect(r).toContain('mainwindow.ui');
      expect(r).toContain('dialog.ui');
    });

    it('parses RESOURCES list', async () => {
      await createFile('res.pro', 'QT += core\nTEMPLATE = app\nRESOURCES = resources.qrc icons.qrc\n');
      const r = await executeQtProFile(join(tempDir, 'res.pro'), tempDir);
      expect(r).toContain('RESOURCES');
      expect(r).toContain('resources.qrc');
    });

    it('parses LIBS entries', async () => {
      await createFile('libs.pro', 'QT += core\nTEMPLATE = app\nLIBS += -lssl -lcrypto -L/usr/local/lib\n');
      const r = await executeQtProFile(join(tempDir, 'libs.pro'), tempDir);
      expect(r).toContain('LIBS');
      expect(r).toContain('-lssl');
      expect(r).toContain('-lcrypto');
    });
  });

  describe('Multi-line continuation', () => {
    it('handles backslash line continuations', async () => {
      await createFile(
        'multiline.pro',
        'QT += core gui widgets\nTEMPLATE = app\n' +
          'SOURCES += main.cpp widget.cpp dialog.cpp\n' +
          'HEADERS += widget.h dialog.h\n',
      );
      const r = await executeQtProFile(join(tempDir, 'multiline.pro'), tempDir);
      expect(r).toContain('SOURCES');
      expect(r).toContain('main.cpp');
      expect(r).toContain('widget.cpp');
      expect(r).toContain('dialog.cpp');
      expect(r).toContain('HEADERS');
    });

    it('handles multiline QT modules', async () => {
      await createFile('qtmultiline.pro', 'QT += core gui widgets sql\nTEMPLATE = app\n');
      const r = await executeQtProFile(join(tempDir, 'qtmultiline.pro'), tempDir);
      expect(r).toContain('Qt Modules (4)');
      expect(r).toContain('widgets');
      expect(r).toContain('sql');
    });
  });

  describe('Auto-discovery', () => {
    it('auto-discovers .pro file in directory', async () => {
      await createFile('autodisc.pro', 'QT += core\nTEMPLATE = app');
      const r = await executeQtProFile(undefined, tempDir);
      expect(r).toContain('core');
      expect(r).not.toContain('No .pro file');
    });

    it('auto-discovers first .pro alphabetically', async () => {
      await createFile('aaa.pro', 'QT += network\nTEMPLATE = app');
      const r = await executeQtProFile(undefined, tempDir);
      expect(r).toContain('network');
    });
  });

  describe('Edge cases', () => {
    it('reports missing .pro gracefully', async () => {
      const r = await executeQtProFile(undefined, tempDir);
      expect(r).toContain('No .pro file');
    });

    it('reports unreadable .pro file gracefully', async () => {
      await createFile('broken.pro', 'QT += core');
      const r = await executeQtProFile(join(tempDir, 'nonexistent.pro'), tempDir);
      expect(r).toContain('Cannot read');
    });

    it('handles minimal .pro with just QT', async () => {
      await createFile('minimal.pro', 'QT += core');
      const r = await executeQtProFile(join(tempDir, 'minimal.pro'), tempDir);
      expect(r).toContain('Qt Modules (1)');
      expect(r).toContain('core');
    });

    it('warns when no core/widgets/quick module found', async () => {
      await createFile('nos.pro', 'QT += network sql\nTEMPLATE = app');
      const r = await executeQtProFile(join(tempDir, 'nos.pro'), tempDir);
      expect(r).toContain('⚠');
      expect(r).toContain('No `core`');
    });

    it('handles comments in .pro file', async () => {
      await createFile('comments.pro', '# This is a comment\nQT += core gui\n# Another comment\nSOURCES = main.cpp\n');
      const r = await executeQtProFile(join(tempDir, 'comments.pro'), tempDir);
      expect(r).toContain('core');
      expect(r).toContain('main.cpp');
    });

    it('handles empty .pro file', async () => {
      await createFile('empty.pro', '');
      const r = await executeQtProFile(join(tempDir, 'empty.pro'), tempDir);
      expect(r).toContain('.pro File Analysis');
    });

    it('truncates long source lists (more than 20)', async () => {
      const srcs = Array.from({ length: 25 }, (_, i) => `file${i}.cpp`).join(' ');
      await createFile('long.pro', `QT += core\nTEMPLATE = app\nSOURCES += ${srcs}\n`);
      const r = await executeQtProFile(join(tempDir, 'long.pro'), tempDir);
      expect(r).toContain('5 more');
    });
  });

  describe('Output format', () => {
    it('includes file path in output', async () => {
      await createFile('pathcheck.pro', 'QT += core\nTEMPLATE = app');
      const r = await executeQtProFile(join(tempDir, 'pathcheck.pro'), tempDir);
      expect(r).toContain('.pro File Analysis');
      expect(r).toContain('pathcheck.pro');
    });

    it('shows module count in header', async () => {
      await createFile('count.pro', 'QT += core gui widgets sql\nTEMPLATE = app');
      const r = await executeQtProFile(join(tempDir, 'count.pro'), tempDir);
      expect(r).toContain('Qt Modules (4)');
    });
  });
});
