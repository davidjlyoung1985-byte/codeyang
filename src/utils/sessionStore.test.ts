import { describe, it, expect } from 'vitest';
import { saveSession, loadSession, listSessions, deleteSession } from '../utils/sessionStore.js';
import type { Message } from '../types.js';

describe('sessionStore', () => {
  const messages: Message[] = [
    { role: 'user', content: 'Hello, write a test' },
    { role: 'assistant', content: 'I will write a test for you.' },
  ];

  it('saves and loads a session', async () => {
    const id = await saveSession(messages);
    expect(id).toBeTruthy();

    const session = await loadSession(id);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(id);
    expect(session!.messages).toHaveLength(2);
    expect(session!.messages[0].content).toBe('Hello, write a test');
  });

  it('lists sessions', async () => {
    await saveSession(messages);
    const sessions = await listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a session', async () => {
    const id = await saveSession(messages);
    const result = await deleteSession(id);
    expect(result).toBe(true);

    const session = await loadSession(id);
    expect(session).toBeNull();
  });

  it('returns null for nonexistent session', async () => {
    const session = await loadSession('nonexistent');
    expect(session).toBeNull();
  });

  it('returns false for deleting nonexistent session', async () => {
    const result = await deleteSession('nonexistent');
    expect(result).toBe(false);
  });
});
