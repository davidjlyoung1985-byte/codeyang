import { readFile, writeFile, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';
import type { Session, Message } from '../types.js';
import { atomicRename } from './fileSystem.js';

const SESSIONS_DIR = join(homedir(), '.codeyang', 'sessions');
const INDEX_FILE = join(homedir(), '.codeyang', 'sessions.index.json');
const AUDIT_LOG = join(homedir(), '.codeyang', 'audit.log');

/** Estimated max tokens per saved session (≈ 1M tokens). Prune based on content size, not message count. */
const MAX_SESSION_TOKENS = 1_000_000;

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const VALID_ROLES = new Set(['system', 'user', 'assistant']);
const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;

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
 * Atomic file write: write to temp then rename to prevent partial reads.
 *
 * Uses atomicRename from fileSystem.ts which handles cross-device moves.
 */
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp.${crypto.randomUUID()}`;
  try {
    await writeFile(tmp, data, 'utf-8');
    await atomicRename(tmp, filePath);
  } catch (err) {
    // Clean up temp file on error
    try {
      await unlink(tmp);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * SECURITY: Clean up old temporary files (orphaned from crashes or errors)
 *
 * Removes .tmp.* files older than 1 hour from sessions directory
 */
export async function cleanupTempFiles(): Promise<number> {
  try {
    await ensureDir();
    const files = await readdir(SESSIONS_DIR);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleaned = 0;

    for (const file of files) {
      if (!file.match(/\.tmp\.[a-f0-9-]+$/)) continue;

      const filePath = join(SESSIONS_DIR, file);
      try {
        const stats = await stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await unlink(filePath);
          cleaned++;
        }
      } catch {
        // File might have been deleted already, ignore
      }
    }

    return cleaned;
  } catch {
    return 0;
  }
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

/**
 * SECURITY: Sanitize messages to redact sensitive information before saving
 *
 * Redacts common patterns for passwords, tokens, and API keys from message content
 */
function sanitizeMessages(messages: Message[]): Message[] {
  return messages.map((msg) => {
    // Only sanitize user messages (assistant messages are AI-generated, less risky)
    if (msg.role !== 'user') return msg;

    let content = msg.content;

    // Redact API keys and tokens
    content = content.replace(/\b(sk-[a-zA-Z0-9]{20,})\b/g, '[REDACTED_API_KEY]');

    // Redact hex tokens (>=32 chars) — but NOT git commit SHAs (40 hex chars, lowercase only).
    // Token hex strings typically include uppercase letters or appear in credential context.
    // Git SHAs are exactly 40 lowercase hex chars, so require mixed case or length != 40.
    content = content.replace(/\b([a-fA-F0-9]{32,63})\b/g, (match) => {
      // Git commit SHAs are 40 lowercase hex characters — don't redact
      if (match.length === 40 && /^[a-f0-9]{40}$/.test(match)) return match;
      // npm tarball integrity hashes (sha512-...) — don't redact
      if (match.startsWith('sha')) return match;
      return '[REDACTED_TOKEN]';
    });

    // Redact Bearer tokens
    content = content.replace(/\b(Bearer\s+)[^\s]+/gi, '$1[REDACTED]');

    // Redact password-like patterns
    content = content.replace(/\b(password|passwd|pwd)[=:]\s*\S+/gi, '$1=[REDACTED]');

    // Redact basic auth credentials (user:pass format)
    content = content.replace(/\b([a-zA-Z0-9._-]+):([^\s@]+)@/g, '$1:[REDACTED]@');

    return { ...msg, content };
  });
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

  // SECURITY: Sanitize sensitive information before saving
  const sanitizedMessages = sanitizeMessages(messages);

  // Prune messages to prevent unbounded growth
  const prunedMessages = pruneMessages(sanitizedMessages);

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

  // SECURITY: Clean up old temp files on each list operation (lightweight cleanup)
  cleanupTempFiles().catch(() => {
    // Ignore cleanup errors, don't block listing
  });

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

export function validateSession(data: unknown): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Data must be a non-null, non-array object');
    return errors;
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    errors.push('"id" must be a non-empty string');
  }
  if (!Array.isArray(obj.messages)) {
    errors.push('"messages" must be an array');
    return errors;
  }
  for (let i = 0; i < obj.messages.length; i++) {
    const msg = obj.messages[i];
    if (!msg || typeof msg !== 'object') {
      errors.push(`messages[${i}]: must be an object`);
      continue;
    }
    const m = msg as Record<string, unknown>;
    if (typeof m.role !== 'string') {
      errors.push(`messages[${i}]: missing "role" field`);
    } else if (!VALID_ROLES.has(m.role)) {
      errors.push(`messages[${i}]: invalid role "${m.role}"`);
    }
    if (m.content !== undefined && m.content !== null && typeof m.content !== 'string') {
      errors.push(`messages[${i}]: "content" must be a string or null`);
    }
    if (m.toolCalls !== undefined) {
      if (!Array.isArray(m.toolCalls)) {
        errors.push(`messages[${i}]: "toolCalls" must be an array`);
      } else {
        for (let j = 0; j < (m.toolCalls as unknown[]).length; j++) {
          const tc = (m.toolCalls as unknown[])[j] as Record<string, unknown>;
          if (!tc || typeof tc !== 'object') {
            errors.push(`messages[${i}].toolCalls[${j}]: must be an object`);
            continue;
          }
          if (typeof tc.name !== 'string' || !TOOL_NAME_PATTERN.test(tc.name)) {
            errors.push(`messages[${i}].toolCalls[${j}]: invalid tool name "${String(tc.name)}"`);
          }
          if (tc.args !== undefined && typeof tc.args !== 'object') {
            errors.push(`messages[${i}].toolCalls[${j}]: "args" must be an object`);
          }
        }
      }
    }
    if (m.toolResults !== undefined) {
      if (!Array.isArray(m.toolResults)) {
        errors.push(`messages[${i}]: "toolResults" must be an array`);
      } else {
        for (let j = 0; j < (m.toolResults as unknown[]).length; j++) {
          const tr = (m.toolResults as unknown[])[j] as Record<string, unknown>;
          if (!tr || typeof tr !== 'object') {
            errors.push(`messages[${i}].toolResults[${j}]: must be an object`);
            continue;
          }
          if (typeof tr.output !== 'string') {
            errors.push(`messages[${i}].toolResults[${j}]: missing "output" string`);
          }
        }
      }
    }
  }
  if (obj.title !== undefined && typeof obj.title !== 'string') {
    errors.push('"title" must be a string');
  }
  for (const field of ['createdAt', 'updatedAt']) {
    if (obj[field] !== undefined && (typeof obj[field] !== 'string' || isNaN(Date.parse(obj[field] as string)))) {
      errors.push(`"${field}" must be a valid ISO date string`);
    }
  }
  return errors;
}

export async function auditLog(entry: {
  action: string;
  command?: string;
  cwd?: string;
  result?: string;
  details?: string;
}): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = JSON.stringify({ timestamp, ...entry }) + '\n';
  try {
    await mkdir(join(homedir(), '.codeyang'), { recursive: true });

    // Rotate log file if it exceeds 10 MB
    try {
      const stats = await stat(AUDIT_LOG);
      if (stats.size >= 10 * 1024 * 1024) {
        const rotated = `${AUDIT_LOG}.1`;
        await rename(AUDIT_LOG, rotated).catch(() => {});
      }
    } catch {
      // File doesn't exist yet — first write, nothing to rotate
    }

    await writeFile(AUDIT_LOG, line, { flag: 'a' });
  } catch {
    // never throw
  }
}

/**
 * Import a previously exported session JSON file and save it as a new
 * session (or update an existing one if the ID matches an existing session).
 *
 * Returns the session ID.
 */
export async function importSession(session: Session): Promise<string> {
  const errors = validateSession(session);
  if (errors.length > 0) {
    throw new Error(`Session validation failed:\n${errors.map((e) => `- ${e}`).join('\n')}`);
  }
  return saveSession(session.messages, session.id);
}

/**
 * Load a session from a JSON file on disk (any path) and save it into the
 * sessions store. Returns the session ID.
 *
 * SECURITY: Uses realpathSync to resolve symlinks before path validation
 */
export async function importSessionFromFile(filePath: string): Promise<string> {
  // SECURITY: Resolve symlinks in allowed base directory
  const allowedBase = realpathSync(join(homedir(), '.codeyang'));

  // SECURITY: Resolve symlinks in target path to prevent traversal via symlink
  let absPath: string;
  try {
    absPath = realpathSync(resolve(filePath));
  } catch (err) {
    throw new Error(
      `Cannot access session file: "${filePath}" — ${
        err instanceof Error ? err.message : 'file not found or symlink broken'
      }`,
    );
  }

  // SECURITY: Validate resolved path is under allowed base
  if (!absPath.startsWith(allowedBase)) {
    throw new Error(
      `Access denied: import path must be under ~/.codeyang/, got "${filePath}" (resolves to "${absPath}")`,
    );
  }
  let fileStat;
  try {
    fileStat = await stat(absPath);
  } catch (err) {
    throw new Error(
      `Cannot read session file: "${filePath}" — ${
        err instanceof Error ? err.message : 'file not found or inaccessible'
      }`,
    );
  }
  if (fileStat.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error(
      `Session file too large: ${(fileStat.size / (1024 * 1024)).toFixed(1)} MB (max: ${MAX_IMPORT_FILE_SIZE / (1024 * 1024)} MB)`,
    );
  }
  let raw: string;
  try {
    raw = await readFile(absPath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read session file: "${filePath}" — ${err instanceof Error ? err.message : String(err)}`);
  }
  let sessionData: unknown;
  try {
    sessionData = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in session file: "${filePath}"`);
  }
  const errors = validateSession(sessionData);
  if (errors.length > 0) {
    throw new Error(`Session validation failed:\n${errors.map((e) => `- ${e}`).join('\n')}`);
  }
  const session = sessionData as Session;
  return saveSession(session.messages, session.id);
}
