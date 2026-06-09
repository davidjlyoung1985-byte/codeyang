import { readFile, writeFile, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
    const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.json'));
    const withMtime = await Promise.all(
      files.map(async (f) => {
        try {
          const fileStat = await stat(join(SESSIONS_DIR, f));
          return { name: f, mtime: fileStat.mtimeMs };
        } catch {
          return { name: f, mtime: 0 };
        }
      }),
    );
    withMtime.sort((a, b) => b.mtime - a.mtime); // most recent first

    const sessions: SessionMeta[] = [];
    for (const { name: f } of withMtime) {
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

// ── Session Export / Import ─────────────────────────────────────

/**
 * Convert a session object to a human‑readable Markdown string.
 * Useful for sharing conversations, reviewing in editors, or archiving.
 */
export function sessionToMarkdown(session: Session): string {
  const lines: string[] = [];
  lines.push(`# CodeYang Session: ${session.title}`);
  lines.push('');
  lines.push(`- **ID:** \`${session.id}\``);
  lines.push(`- **Created:** ${session.createdAt}`);
  lines.push(`- **Updated:** ${session.updatedAt}`);
  lines.push(`- **Messages:** ${session.messages.length}`);
  lines.push('');

  for (const msg of session.messages) {
    if (msg.role === 'system') {
      lines.push('### System\n');
      lines.push(msg.content);
      lines.push('');
    } else if (msg.role === 'user') {
      lines.push('## User\n');
      lines.push(msg.content);
      lines.push('');
    } else if (msg.role === 'assistant') {
      const text = msg.content || '';
      lines.push(`## CodeYang\n`);
      if (text) {
        lines.push(text);
        lines.push('');
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          lines.push(`> **Tool call:** \`${tc.name}\``);
          lines.push(`> \`\`\`json`);
          const formatted = JSON.stringify(tc.args, null, 2);
          for (const argLine of formatted.split('\n')) {
            lines.push(`> ${argLine}`);
          }
          lines.push(`> \`\`\`\n`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Export a session as Markdown (returns the string).
 * Throws if the session doesn't exist.
 */
export async function exportSessionAsMarkdown(id: string): Promise<string> {
  const session = await loadSession(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  return sessionToMarkdown(session);
}

/**
 * Export a session's raw JSON (returns the parsed object).
 * Throws if the session doesn't exist.
 */
export async function exportSessionAsJson(id: string): Promise<Session> {
  const session = await loadSession(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  return session;
}

/**
 * Import a previously exported session JSON file and save it as a new
 * session (or update an existing one if the ID matches an existing session).
 *
 * Returns the session ID.
 */
export async function importSession(session: Session): Promise<string> {
  // Preserve the original ID so re‑importing the same export is idempotent.
  return saveSession(session.messages, session.id);
}

/**
 * Load a session from a JSON file on disk (any path) and save it into the
 * sessions store. Returns the session ID.
 */
export async function importSessionFromFile(filePath: string): Promise<string> {
  const absPath = resolve(filePath);
  const raw = await readFile(absPath, 'utf-8');
  const session: Session = JSON.parse(raw);

  // Validate minimal required fields
  if (!session.id || !session.messages || !Array.isArray(session.messages)) {
    throw new Error(`Invalid session file: must contain "id" (string) and "messages" (array).`);
  }

  return importSession(session);
}
