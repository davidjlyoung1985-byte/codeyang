import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as snapshot from './snapshot.js';
import { executeWrite } from '../tools/WriteTool.js';
import { executeEdit } from '../tools/EditTool.js';
import { executeDelete, executeMove } from '../tools/FileSystemTool.js';

let workDir: string;
let homeDir: string;
const savedHome = process.env['CODYANG_HOME'];
const savedHome2 = process.env['CODEYANG_HOME'];

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'cy-snap-work-'));
  homeDir = await mkdtemp(join(tmpdir(), 'cy-snap-home-'));
  process.env['CODEYANG_HOME'] = homeDir;
  process.env['CODYANG_HOME'] = homeDir;
  // Fresh session per test: rotate the pointer so no history leaks between cases.
  await snapshot.startNewSnapshotSession();
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(tmpdir());
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
  await rm(homeDir, { recursive: true, force: true }).catch(() => {});
  if (savedHome === undefined) delete process.env['CODYANG_HOME'];
  else process.env['CODYANG_HOME'] = savedHome;
  if (savedHome2 === undefined) delete process.env['CODEYANG_HOME'];
  else process.env['CODEYANG_HOME'] = savedHome2;
  await snapshot.startNewSnapshotSession().catch(() => {});
});

describe('snapshot: core capture/undo', () => {
  it('reports nothing to undo on a fresh session', async () => {
    const res = await snapshot.undo();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Nothing to undo/);
  });

  it('restores an overwritten file', async () => {
    const file = join(workDir, 'a.txt');
    await writeFile(file, 'original', 'utf-8');

    await snapshot.captureFile(file, 'Write');
    await writeFile(file, 'changed', 'utf-8');

    const res = await snapshot.undo();
    expect(res.ok).toBe(true);
    expect(await readFile(file, 'utf-8')).toBe('original');
  });

  it('removes a file that did not exist before the write', async () => {
    const file = join(workDir, 'brand-new.txt');

    const captured = await snapshot.captureFile(file, 'Write');
    expect(captured.wasAbsent).toBe(true);

    await writeFile(file, 'created', 'utf-8');
    expect(existsSync(file)).toBe(true);

    const res = await snapshot.undo();
    expect(res.ok).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it('restores a recursively deleted directory', async () => {
    const dir = join(workDir, 'proj');
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'index.ts'), 'export const x = 1;', 'utf-8');
    await writeFile(join(dir, 'README.md'), '# proj', 'utf-8');

    await snapshot.captureTree(dir, 'Delete');
    await rm(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);

    const res = await snapshot.undo();
    expect(res.ok).toBe(true);
    expect(await readFile(join(dir, 'src', 'index.ts'), 'utf-8')).toBe('export const x = 1;');
    expect(await readFile(join(dir, 'README.md'), 'utf-8')).toBe('# proj');
  });

  it('moves a file back on undo', async () => {
    const from = join(workDir, 'old.txt');
    const to = join(workDir, 'moved.txt');
    await writeFile(from, 'payload', 'utf-8');

    await snapshot.captureMove(from, to);
    const { rename } = await import('node:fs/promises');
    await rename(from, to);

    const res = await snapshot.undo();
    expect(res.ok).toBe(true);
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('supports multiple sequential undos', async () => {
    const f1 = join(workDir, 'f1.txt');
    const f2 = join(workDir, 'f2.txt');
    await writeFile(f1, 'v1', 'utf-8');
    await writeFile(f2, 'v2', 'utf-8');

    await snapshot.captureFile(f1, 'Write');
    await writeFile(f1, 'v1-changed', 'utf-8');

    await snapshot.captureFile(f2, 'Write');
    await writeFile(f2, 'v2-changed', 'utf-8');

    await snapshot.undo(); // reverts f2
    expect(await readFile(f2, 'utf-8')).toBe('v2');
    expect(await readFile(f1, 'utf-8')).toBe('v1-changed');

    await snapshot.undo(); // reverts f1
    expect(await readFile(f1, 'utf-8')).toBe('v1');
  });

  it('survives a session reset (index is persisted to disk)', async () => {
    const file = join(workDir, 'persist.txt');
    await writeFile(file, 'before', 'utf-8');
    await snapshot.captureFile(file, 'Write');
    await writeFile(file, 'after', 'utf-8');

    // Simulate a process restart: drop in-memory state, keep the session pointer.
    snapshot.resetSnapshotSession();

    expect(await snapshot.canUndo()).toBe(true);

    const res = await snapshot.undo();
    expect(res.ok).toBe(true);
    expect(await readFile(file, 'utf-8')).toBe('before');
  });

  it('exposes recent snapshots for listing', async () => {
    const file = join(workDir, 'listed.txt');
    await writeFile(file, 'x', 'utf-8');
    await snapshot.captureFile(file, 'Write');

    const list = await snapshot.listSnapshots(10);
    expect(list).toHaveLength(1);
    expect(list[0].tool).toBe('Write');
    expect(list[0].kind).toBe('file');
  });
});

describe('snapshot: wired into tools', () => {
  it('Write is undoable', async () => {
    const file = join(workDir, 'w.txt');
    await writeFile(file, 'v1', 'utf-8');

    await executeWrite(file, 'v2');
    expect(await readFile(file, 'utf-8')).toBe('v2');

    await snapshot.undo();
    expect(await readFile(file, 'utf-8')).toBe('v1');
  });

  it('Write creating a new file is undoable', async () => {
    const file = join(workDir, 'created.txt');
    await executeWrite(file, 'hello');
    expect(existsSync(file)).toBe(true);

    await snapshot.undo();
    expect(existsSync(file)).toBe(false);
  });

  it('Edit is undoable', async () => {
    const file = join(workDir, 'e.txt');
    await writeFile(file, 'foo bar baz', 'utf-8');

    await executeEdit(file, 'bar', 'QUX');
    expect(await readFile(file, 'utf-8')).toBe('foo QUX baz');

    await snapshot.undo();
    expect(await readFile(file, 'utf-8')).toBe('foo bar baz');
  });

  it('Delete is undoable for a single file', async () => {
    const file = join(workDir, 'd.txt');
    await writeFile(file, 'to delete', 'utf-8');

    await executeDelete(file);
    expect(existsSync(file)).toBe(false);

    await snapshot.undo();
    expect(await readFile(file, 'utf-8')).toBe('to delete');
  });

  it('Delete is undoable for a directory', async () => {
    const dir = join(workDir, 'dir');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'inner.txt'), 'inner', 'utf-8');

    await executeDelete(dir, true);
    expect(existsSync(dir)).toBe(false);

    await snapshot.undo();
    expect(await readFile(join(dir, 'inner.txt'), 'utf-8')).toBe('inner');
  });

  it('Move is undoable', async () => {
    const from = join(workDir, 'src.txt');
    const to = join(workDir, 'dst.txt');
    await writeFile(from, 'move me', 'utf-8');

    await executeMove(from, to);
    expect(existsSync(to)).toBe(true);
    expect(existsSync(from)).toBe(false);

    await snapshot.undo();
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(await readFile(from, 'utf-8')).toBe('move me');
  });
});

describe('snapshot: safety', () => {
  it('clears the redo tail when a new action is recorded', async () => {
    const a = join(workDir, 'a.txt');
    const b = join(workDir, 'b.txt');
    await writeFile(a, 'a1', 'utf-8');
    await writeFile(b, 'b1', 'utf-8');

    await snapshot.captureFile(a, 'Write');
    await writeFile(a, 'a2', 'utf-8');
    await snapshot.undo();
    expect(await snapshot.canRedo()).toBe(true);

    // New action should invalidate redo.
    await snapshot.captureFile(b, 'Write');
    expect(await snapshot.canRedo()).toBe(false);
  });

  it('skips node_modules when snapshotting a tree', async () => {
    const dir = join(workDir, 'with-modules');
    await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(dir, 'keep.txt'), 'keep', 'utf-8');
    await writeFile(join(dir, 'node_modules', 'pkg', 'index.js'), 'skip me', 'utf-8');

    await snapshot.captureTree(dir, 'Delete');
    await rm(dir, { recursive: true, force: true });
    await snapshot.undo();

    expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules'))).toBe(false);
  });

  it('does not throw when undoing against a hand-deleted target', async () => {
    const file = join(workDir, 'gone.txt');
    await writeFile(file, 'x', 'utf-8');
    await snapshot.captureFile(file, 'Write');
    await rm(file, { force: true });

    // Undo should recreate the file from the backup.
    const res = await snapshot.undo();
    expect(res.ok).toBe(true);
    expect(await readFile(file, 'utf-8')).toBe('x');
  });
});
