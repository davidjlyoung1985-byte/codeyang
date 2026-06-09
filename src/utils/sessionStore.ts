import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';
import type { Session, Message } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.codeyang', 'sessions');
const INDEX_FILE = join(homedir(), '.codeyang', 'sessions.index.json');

/** Maximum messages retained per session before pruning older entries. */
const MAX_SESSION_MESSAGES = 100;

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

/**
 * Prune session messages to the latest N entries.
 * Keeps the first (system) message + the last (MAX_SESSION_MESSAGES - 1) messages
 * so the conversation context and instructions aren't lost entirely.
 */
function pruneMessages(messages: Message[]): Message[] {
  if (messages.length <= MAX_SESSION_MESSAGES) return messages;

  // Always keep the first message (typically system prompt / instructions)
  const keepHead = 1;
  const keepTail = MAX_SESSION_MESSAGES - keepHead;

  const head = messages.slice(0, keepHead);
  const tail = messages.slice(-keepTail);

  // Add a notice that older messages were pruned
  const prunedCount = messages.length - (keepHead + keepTail);
  const notice: Message = {
    role: 'system',
    content: `[System: ${prunedCount} older message(s) were pruned due to context length limits. Key information from those messages has been preserved in the session's persistent memory.]`,
  };

  return [...head, notice, ...tail];
}

export async function saveSession(messages: Message[], existingId?: string): Promise<string> {
  await ensureDir();
  const now = new Date().toISOString();
  const id = existingId ?? `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  // Title is derived from the FIRST user message only (consistent across updates)
  const title = (messages.find((m) => m.role === 'user')?.content.slice(0, 50) || 'untitled').replace(/\n/g, ' ');

  // Preserve createdAt from existing session if updating
  let createdAt = now;
  if (existingId) {
    const index = await readIndex();
    createdAt = index[existingId]?.createdAt ?? now;
  }

  // Prune messages to prevent unbounded growth
  const prunedMessages = pruneMessages(messages);

  const session: Session = { id, title, createdAt, updatedAt: now, messages: prunedMessages };
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
