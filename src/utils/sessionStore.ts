import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';
import type { Session, Message } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.codeyang', 'sessions');
const INDEX_FILE = join(homedir(), '.codeyang', 'sessions.index.json');

type SessionMeta = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt'>;

async function ensureDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

async function readIndex(): Promise<Record<string, SessionMeta>> {
  try {
    return JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, SessionMeta>): Promise<void> {
  await writeFile(INDEX_FILE, JSON.stringify(index), 'utf-8');
}

export async function saveSession(messages: Message[], existingId?: string): Promise<string> {
  await ensureDir();
  const now = new Date().toISOString();
  const id = existingId ?? `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const title = (messages.find((m) => m.role === 'user')?.content.slice(0, 50) || 'untitled').replace(/\n/g, ' ');

  // Preserve createdAt from existing session if updating
  let createdAt = now;
  if (existingId) {
    const index = await readIndex();
    createdAt = index[existingId]?.createdAt ?? now;
  }

  const session: Session = { id, title, createdAt, updatedAt: now, messages };
  await writeFile(join(SESSIONS_DIR, `${id}.json`), JSON.stringify(session, null, 2));

  // Update index (metadata only — fast listing)
  const index = await readIndex();
  index[id] = { id, title, createdAt, updatedAt: now };
  await writeIndex(index);

  return id;
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    return JSON.parse(await readFile(join(SESSIONS_DIR, `${id}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<SessionMeta[]> {
  await ensureDir();
  const index = await readIndex();
  const entries = Object.values(index);

  // If index is empty, fall back to scanning files (backward compat)
  if (entries.length === 0) {
    const files = (await readdir(SESSIONS_DIR))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    const sessions: SessionMeta[] = [];
    for (const f of files) {
      try {
        const { id, title, createdAt, updatedAt } = JSON.parse(await readFile(join(SESSIONS_DIR, f), 'utf-8'));
        sessions.push({ id, title, createdAt, updatedAt });
      } catch {}
    }
    return sessions;
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface SessionSearchResult extends SessionMeta {
  matchCount: number;
}

/**
 * Search sessions by keyword. Checks title first (fast), then loads
 * full sessions to search message content. Returns up to 20 results.
 */
export async function searchSessions(keyword: string): Promise<SessionSearchResult[]> {
  await ensureDir();
  const index = await readIndex();
  const kw = keyword.toLowerCase();
  const results: SessionSearchResult[] = [];

  const entries = Object.values(index).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  for (const meta of entries) {
    if (results.length >= 20) break;

    // Quick match on title
    if (meta.title.toLowerCase().includes(kw)) {
      results.push({ ...meta, matchCount: 1 });
      continue;
    }

    // Load session and search content
    try {
      const session = await loadSession(meta.id);
      if (!session) continue;
      let matchCount = 0;
      for (const msg of session.messages) {
        if (msg.content && msg.content.toLowerCase().includes(kw)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        results.push({ ...meta, matchCount });
      }
    } catch {
      // Skip unreadable sessions
    }
  }

  return results;
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await unlink(join(SESSIONS_DIR, `${id}.json`));
    const index = await readIndex();
    delete index[id];
    await writeIndex(index);
    return true;
  } catch {
    return false;
  }
}
