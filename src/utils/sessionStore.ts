import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Session, Message } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.codeyang', 'sessions');

async function ensureDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

export async function saveSession(messages: Message[]): Promise<string> {
  await ensureDir();
  const id = Date.now().toString(36);
  const title = messages.find(m => m.role === 'user')?.content.slice(0, 50) || 'untitled';
  const session: Session = {
    id,
    title: title.replace(/\n/g, ' '),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages,
  };
  await writeFile(join(SESSIONS_DIR, `${id}.json`), JSON.stringify(session, null, 2));
  return id;
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    const data = await readFile(join(SESSIONS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<Session[]> {
  await ensureDir();
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(SESSIONS_DIR);
  const sessions: Session[] = [];
  for (const f of files.filter(f => f.endsWith('.json')).sort().reverse()) {
    try {
      const data = await readFile(join(SESSIONS_DIR, f), 'utf-8');
      sessions.push(JSON.parse(data));
    } catch {}
  }
  return sessions;
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await unlink(join(SESSIONS_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
