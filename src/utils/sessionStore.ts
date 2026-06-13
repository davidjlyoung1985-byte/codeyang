import { readFile, writeFile, mkdir, unlink, readdir, stat, rename, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';
import type { Session, Message } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.codeyang', 'sessions');
const INDEX_FILE = join(homedir(), '.codeyang', 'sessions.index.json');

/** Estimated max tokens per saved session (≈ 1M tokens). Prune based on content size, not message count. */
const MAX_SESSION_TOKENS = 1_000_000;

/** Rough token estimate: 1 token ≈ 4 characters for typical code/text. */
function estimateTokens(msg: Message): number {
  const content = msg.content || '';
  let total = Math.ceil(content.length / 4);
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      total += Math.ceil(JSON.stringify(tc.args).length / 4);
    }
  }
  if (msg.toolResults) {
    for (const tr of msg.toolResults) {
      total += Math.ceil(tr.output.length / 4);
    }
  }
  return total;
}

type SessionMeta = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt'> & { messageCount: number };

async function ensureDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

/**
 * 跨设备安全的原子写入。
 *
 * 先用临时文件写入，再 rename 到目标路径。
 * rename() 在跨文件系统时抛出 EXDEV（例如 %TEMP% 在 C: 而 .codeyang 在 D:），
 * 此时回退到 copyFile + unlink。
 */
async function safeRename(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(src, dest);
      await unlink(src).catch(() => {}); // 尽力清理临时文件
    } else {
      throw err;
    }
  }
}

/** Atomic file write: write to temp then rename to prevent partial reads by concurrent callers. */
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp.${process.pid}`;
  await writeFile(tmp, data, 'utf-8');
  await safeRename(tmp, filePath);
}

async function readIndex(): Promise<Record<string, SessionMeta>> {
  try {
    return JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, SessionMeta>): Promise<void> {
  await atomicWrite(INDEX_FILE, JSON.stringify(index));
}

/**
 * Prune session messages using token-based threshold.
 * Keeps the first message + as many recent messages as fit within MAX_SESSION_TOKENS.
 */
function pruneMessages(messages: Message[]): Message[] {
  // Estimate total tokens — skip pruning if under limit
  let totalTokens = 0;
  for (const m of messages) totalTokens += estimateTokens(m);
  if (totalTokens <= MAX_SESSION_TOKENS) return messages;

  // Always keep the first message
  const keepHead = 1;
  const head = messages.slice(0, keepHead);

  // Keep as many recent messages as fit within token budget
  const keepTail: Message[] = [];
  let tailTokens = 0;
  for (let i = messages.length - 1; i >= keepHead; i--) {
    const msg = messages[i];
    const tokens = estimateTokens(msg);
    if (tailTokens + tokens > MAX_SESSION_TOKENS * 0.7) break; // leave room for system notice
    keepTail.unshift(msg);
    tailTokens += tokens;
  }

  // Add a notice that older messages were pruned
  const prunedCount = messages.length - (keepHead + keepTail.length);
  if (prunedCount <= 0) return messages;
  const notice: Message = {
    role: 'system',
    content: `[System: ${prunedCount} message(s) (~${Math.round((totalTokens - tailTokens) / 1000)}K tokens) were pruned due to size limits.]`,
  };

  return [...head, notice, ...keepTail];
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
  await atomicWrite(join(SESSIONS_DIR, `${id}.json`), JSON.stringify(session, null, 2));

  // Update index (metadata only — fast listing)
  const index = await readIndex();
  index[id] = { id, title, createdAt, updatedAt: now, messageCount: prunedMessages.length };
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
        const { id, title, createdAt, updatedAt, messages } = JSON.parse(
          await readFile(join(SESSIONS_DIR, f), 'utf-8'),
        );
        sessions.push({ id, title, createdAt, updatedAt, messageCount: messages?.length ?? 0 });
      } catch {}
    }
    return sessions;
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface SessionSearchResult {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Search sessions by query text (title only) and/or recency in days.
 * Returns enriched results with message count from the index.
 */
export async function searchSessions(query?: string, days?: number): Promise<SessionSearchResult[]> {
  const all = await listSessions();
  let filtered = all;

  // Filter by recency
  if (days && days > 0) {
    const cutoff = Date.now() - days * 86_400_000;
    filtered = filtered.filter((s) => new Date(s.updatedAt).getTime() > cutoff);
  }

  // Filter by text query on title
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((s) => s.title.toLowerCase().includes(q));
  }

  // messageCount is already in the index — no need to load individual files
  return filtered.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messageCount: s.messageCount,
  }));
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
