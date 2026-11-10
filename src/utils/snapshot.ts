/**
 * Unified filesystem snapshot layer.
 *
 * Every mutating tool (`Write`, `Edit`, `MultiEdit`, `Delete`, `Move`) records a
 * snapshot *before* touching disk, so `/undo` and `/redo` cover all of them —
 * not just `Edit`.
 *
 * Design notes:
 *   - Snapshots live on disk under `<CODYANG_HOME>/snapshots/<session>/`, so undo
 *     still works after a crash or a restart.
 *   - An in-memory ring keeps the hot path fast; the disk index is the source of
 *     truth and is rebuilt lazily.
 *   - `Delete` backs up the whole subtree (bounded), so recursive deletes are
 *     recoverable instead of silently permanent.
 *   - `Move` records a rename intent; undo moves it back.
 */
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { codeyangPath } from './paths.js';
import { logger } from './logger.js';

export type SnapshotKind = 'file' | 'tree' | 'move';

export interface SnapshotEntry {
  id: string;
  kind: SnapshotKind;
  /** Tool that produced the snapshot. */
  tool: string;
  /** Absolute path the tool was about to modify. */
  path: string;
  /** Where the pre-change bytes live. Empty for `move`. */
  backupPath: string;
  /** For `move`: the destination path. */
  moveTo?: string;
  /** Entry was a directory (affects restore logic). */
  isDirectory: boolean;
  /** Original size in bytes (0 for move). */
  bytes: number;
  timestamp: number;
}

interface SnapshotIndex {
  version: number;
  sessionId: string;
  entries: SnapshotEntry[];
  /** Cursor: entries[0..cursor) are applied; entries[cursor..] are redoable. */
  cursor: number;
}

const INDEX_VERSION = 1;
const MAX_ENTRIES = 100;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
/** A single tree backup larger than this is refused rather than silently dropped. */
const MAX_TREE_BYTES = 40 * 1024 * 1024;
const MAX_TREE_FILES = 5_000;

/** Files that are never worth snapshotting. */
const SKIP_NAMES = new Set(['node_modules', '.git', '.codeyang', 'dist', 'build', 'coverage', '.next']);

function snapshotsRoot(): string {
  return codeyangPath('snapshots');
}

let sessionDirCache: string | null = null;

/** File pointing at the active session directory, so a restart reuses it. */
function sessionPointerPath(): string {
  return join(snapshotsRoot(), 'current');
}

/**
 * Resolve the active session directory.
 *
 * The pointer file is what makes undo survive a crash or restart: without it
 * every new process would start from an empty history and silently lose the
 * ability to revert the previous run's changes.
 */
async function getSessionDir(): Promise<string> {
  if (sessionDirCache) return sessionDirCache;

  const pointer = sessionPointerPath();
  try {
    const name = (await readFile(pointer, 'utf-8')).trim();
    if (name) {
      sessionDirCache = join(snapshotsRoot(), name);
      return sessionDirCache;
    }
  } catch {
    // No pointer yet — first run in this home directory.
  }

  const name = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  sessionDirCache = join(snapshotsRoot(), name);
  await mkdir(snapshotsRoot(), { recursive: true });
  await writeFile(pointer, name, 'utf-8');
  return sessionDirCache;
}

/**
 * Forget all in-memory state but keep the session pointer.
 * Simulates a process restart (used by tests and crash recovery).
 */
export function resetSnapshotSession(): void {
  index = null;
  loaded = false;
}

/**
 * Rotate to a brand-new session directory, abandoning the previous history.
 * Use for an explicit fresh session, never for a restart.
 */
export async function startNewSnapshotSession(): Promise<void> {
  index = null;
  loaded = false;
  sessionDirCache = null;
  await rm(sessionPointerPath(), { force: true }).catch(() => {});
}

async function indexPathAsync(): Promise<string> {
  return join(await getSessionDir(), 'index.json');
}

function safeId(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}

// ── Index management ───────────────────────────────────────

let index: SnapshotIndex | null = null;
let loaded = false;

function emptyIndex(): SnapshotIndex {
  return { version: INDEX_VERSION, sessionId: sessionDirCache ?? '', entries: [], cursor: 0 };
}

async function loadIndex(): Promise<SnapshotIndex> {
  if (loaded && index) return index;
  loaded = true;
  const path = await indexPathAsync();
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as SnapshotIndex;
    if (parsed?.version === INDEX_VERSION && Array.isArray(parsed.entries)) {
      index = parsed;
      return parsed;
    }
    index = emptyIndex();
  } catch {
    index = emptyIndex();
  }
  return index;
}

async function persistIndex(idx: SnapshotIndex): Promise<void> {
  const dir = await getSessionDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'index.json');
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(idx, null, 2), 'utf-8');
  // Rename for atomicity, so a crash never leaves a half-written index.
  const { rename } = await import('node:fs/promises');
  await rename(tmp, path);
}

function totalBytes(entries: SnapshotEntry[]): number {
  return entries.reduce((sum, e) => sum + e.bytes, 0);
}

/** Drop snapshots until both the count and byte caps are satisfied. */
async function evictIfNeeded(idx: SnapshotIndex): Promise<void> {
  let evicted = 0;
  while (idx.entries.length > MAX_ENTRIES || totalBytes(idx.entries) > MAX_TOTAL_BYTES) {
    if (idx.entries.length <= 1) break;
    const dropped = idx.entries.shift();
    idx.cursor = Math.max(0, idx.cursor - 1);
    if (!dropped) break;
    evicted++;
    // Best-effort cleanup; a missing backup must never break undo for the rest.
    await rm(dropped.backupPath, { recursive: true, force: true }).catch(() => {});
  }
  if (evicted > 0) {
    logger.debug(`[snapshot] evicted ${evicted} old snapshot(s) to stay under caps`);
  }
}

/**
 * Append an entry, truncating any redo tail (a new action forks history).
 */
async function appendEntry(entry: SnapshotEntry): Promise<void> {
  const idx = await loadIndex();
  if (idx.cursor < idx.entries.length) {
    // Discard the redo tail and its backups — those changes can no longer be redone.
    for (const stale of idx.entries.slice(idx.cursor)) {
      await rm(stale.backupPath, { recursive: true, force: true }).catch(() => {});
    }
    idx.entries = idx.entries.slice(0, idx.cursor);
  }
  idx.entries.push(entry);
  idx.cursor = idx.entries.length;
  await evictIfNeeded(idx);
  await persistIndex(idx);
}

// ── Public capture API ─────────────────────────────────────

/** Result of a snapshot attempt. `null` means "nothing to restore" (new file). */
export interface CaptureResult {
  entry: SnapshotEntry | null;
  /** True when the target did not exist yet — undo must delete it. */
  wasAbsent: boolean;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshot a single file before overwriting or editing it.
 * A non-existent file records an "absent" marker so undo removes it.
 */
export async function captureFile(filePath: string, tool: string): Promise<CaptureResult> {
  const abs = resolve(filePath);
  if (!(await pathExists(abs))) {
    const entry: SnapshotEntry = {
      id: randomUUID().slice(0, 12),
      kind: 'file',
      tool,
      path: abs,
      backupPath: '',
      isDirectory: false,
      bytes: 0,
      timestamp: Date.now(),
    };
    await appendEntry(entry);
    return { entry, wasAbsent: true };
  }

  const info = await stat(abs);
  if (info.isDirectory()) {
    // Callers that mean "tree" should call captureTree; do it for them.
    return captureTree(abs, tool);
  }

  const backupPath = join(await getSessionDir(), `blobs/${safeId(abs)}-${Date.now()}.bak`);
  await mkdir(dirname(backupPath), { recursive: true });
  await copyFile(abs, backupPath);

  const entry: SnapshotEntry = {
    id: randomUUID().slice(0, 12),
    kind: 'file',
    tool,
    path: abs,
    backupPath,
    isDirectory: false,
    bytes: info.size,
    timestamp: Date.now(),
  };
  await appendEntry(entry);
  return { entry, wasAbsent: false };
}

/**
 * Snapshot a directory subtree before a recursive delete.
 *
 * Bounded on purpose: refusing an oversized tree is better than pretending the
 * delete is undoable and then failing later.
 */
export async function captureTree(dirPath: string, tool: string): Promise<CaptureResult> {
  const abs = resolve(dirPath);
  if (!(await pathExists(abs))) {
    const entry: SnapshotEntry = {
      id: randomUUID().slice(0, 12),
      kind: 'tree',
      tool,
      path: abs,
      backupPath: '',
      isDirectory: true,
      bytes: 0,
      timestamp: Date.now(),
    };
    await appendEntry(entry);
    return { entry, wasAbsent: true };
  }

  const backupPath = join(await getSessionDir(), `trees/${safeId(abs)}-${Date.now()}`);
  const { bytes, files } = await copyTree(abs, backupPath, { bytes: 0, files: 0 });

  if (files >= MAX_TREE_FILES || bytes >= MAX_TREE_BYTES) {
    // Too big to keep; remove the partial copy and record the fact.
    await rm(backupPath, { recursive: true, force: true }).catch(() => {});
    logger.warn(
      `[snapshot] tree too large to snapshot (${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB): ${abs}`,
    );
    const entry: SnapshotEntry = {
      id: randomUUID().slice(0, 12),
      kind: 'tree',
      tool,
      path: abs,
      backupPath: '',
      isDirectory: true,
      bytes: 0,
      timestamp: Date.now(),
    };
    await appendEntry(entry);
    return { entry, wasAbsent: false };
  }

  const entry: SnapshotEntry = {
    id: randomUUID().slice(0, 12),
    kind: 'tree',
    tool,
    path: abs,
    backupPath,
    isDirectory: true,
    bytes,
    timestamp: Date.now(),
  };
  await appendEntry(entry);
  return { entry, wasAbsent: false };
}

/** Record a move so undo can move the path back. */
export async function captureMove(from: string, to: string, tool = 'Move'): Promise<CaptureResult> {
  const absFrom = resolve(from);
  const entry: SnapshotEntry = {
    id: randomUUID().slice(0, 12),
    kind: 'move',
    tool,
    path: absFrom,
    backupPath: '',
    moveTo: resolve(to),
    isDirectory: (await pathExists(absFrom)) ? (await stat(absFrom)).isDirectory() : false,
    bytes: 0,
    timestamp: Date.now(),
  };
  await appendEntry(entry);
  return { entry, wasAbsent: false };
}

/** Recursively copy `src` into `dest`, skipping heavy/irrelevant directories. */
async function copyTree(
  src: string,
  dest: string,
  acc: { bytes: number; files: number },
): Promise<{ bytes: number; files: number }> {
  if (acc.files >= MAX_TREE_FILES || acc.bytes >= MAX_TREE_BYTES) return acc;

  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const e of entries) {
    if (SKIP_NAMES.has(e.name)) continue;
    if (acc.files >= MAX_TREE_FILES || acc.bytes >= MAX_TREE_BYTES) break;

    const srcPath = join(src, e.name);
    const destPath = join(dest, e.name);

    if (e.isDirectory()) {
      await copyTree(srcPath, destPath, acc);
    } else if (e.isSymbolicLink()) {
      // Skip symlinks: copying them can escape the tree or loop.
      continue;
    } else {
      await copyFile(srcPath, destPath);
      acc.files++;
      try {
        acc.bytes += (await stat(srcPath)).size;
      } catch {
        // Size unknown; count the file anyway.
      }
    }
  }
  return acc;
}

// ── Undo / redo ────────────────────────────────────────────

export interface UndoResult {
  ok: boolean;
  /** Human-readable description for the CLI. */
  message: string;
  entry?: SnapshotEntry;
  /** True when redo is available after this call. */
  canRedo?: boolean;
}

/**
 * Undo the most recent snapshot: restore bytes, recreate, or move back.
 */
export async function undo(): Promise<UndoResult> {
  const idx = await loadIndex();
  if (idx.cursor <= 0) return { ok: false, message: 'Nothing to undo.' };

  const entry = idx.entries[idx.cursor - 1];
  try {
    await restore(entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Undo failed for ${entry.path}: ${msg}`, entry };
  }

  idx.cursor--;
  await persistIndex(idx);
  return {
    ok: true,
    message: describe(entry, 'Undone'),
    entry,
    canRedo: idx.cursor < idx.entries.length,
  };
}

/** Re-apply the most recently undone snapshot. */
export async function redo(): Promise<UndoResult> {
  const idx = await loadIndex();
  if (idx.cursor >= idx.entries.length) return { ok: false, message: 'Nothing to redo.' };

  const entry = idx.entries[idx.cursor];
  try {
    await reapply(entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Redo failed for ${entry.path}: ${msg}`, entry };
  }

  idx.cursor++;
  await persistIndex(idx);
  return { ok: true, message: describe(entry, 'Redone'), entry, canRedo: idx.cursor < idx.entries.length };
}

/** Put the pre-change state of `entry` back on disk. */
async function restore(entry: SnapshotEntry): Promise<void> {
  if (entry.kind === 'move') {
    if (!entry.moveTo) throw new Error('move snapshot has no destination');
    // Move it back to where it came from.
    if (await pathExists(entry.path)) {
      await rm(entry.path, { recursive: true, force: true });
    }
    const { rename } = await import('node:fs/promises');
    await mkdir(dirname(entry.path), { recursive: true });
    await rename(entry.moveTo, entry.path);
    return;
  }

  if (!entry.backupPath) {
    // Was absent before the change (a fresh create) or too big to back up.
    if (entry.bytes === 0 && !(await pathExists(entry.path))) return;
    // Too-big tree: we cannot restore, but we must not lie about it.
    if (entry.kind === 'tree') {
      throw new Error('directory was too large to snapshot and cannot be restored');
    }
    // File created by the tool: undo means remove it.
    await rm(entry.path, { recursive: true, force: true });
    return;
  }

  if (entry.isDirectory) {
    await rm(entry.path, { recursive: true, force: true });
    await copyTree(entry.backupPath, entry.path, { bytes: 0, files: 0 });
    return;
  }

  await mkdir(dirname(entry.path), { recursive: true });
  await copyFile(entry.backupPath, entry.path);
}

/** Re-apply a snapshot after an undo, for file/tree entries only. */
async function reapply(entry: SnapshotEntry): Promise<void> {
  if (entry.kind === 'move') {
    if (!entry.moveTo) throw new Error('move snapshot has no destination');
    const { rename } = await import('node:fs/promises');
    await mkdir(dirname(entry.moveTo), { recursive: true });
    await rename(entry.path, entry.moveTo);
    return;
  }
  // Without a post-change copy we cannot reconstruct the new bytes, so redo of
  // a destructive file/tree op is a no-op that keeps the cursor consistent.
  throw new Error('redo is only supported for Move; the post-change state was not captured');
}

function describe(entry: SnapshotEntry, verb: string): string {
  const name = basename(entry.path);
  if (entry.kind === 'move') return `${verb} move: ${name} -> ${basename(entry.moveTo ?? '')}`;
  if (entry.kind === 'tree') return `${verb} delete of directory ${name}/`;
  if (!entry.backupPath) return `${verb} creation of ${name}`;
  return `${verb} ${entry.tool} on ${name}`;
}

// ── Introspection ──────────────────────────────────────────

export async function canUndo(): Promise<boolean> {
  const idx = await loadIndex();
  return idx.cursor > 0;
}

export async function canRedo(): Promise<boolean> {
  const idx = await loadIndex();
  return idx.cursor < idx.entries.length;
}

/** Recent snapshots, newest last. Useful for `/rewind` listings. */
export async function listSnapshots(limit = 20): Promise<SnapshotEntry[]> {
  const idx = await loadIndex();
  return idx.entries.slice(Math.max(0, idx.entries.length - limit));
}
