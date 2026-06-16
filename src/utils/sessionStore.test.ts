import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  importSession,
  importSessionFromFile,
  exportSessionAsMarkdown,
  exportSessionAsJson,
  searchSessions,
  validateSession,
  sessionToMarkdown,
  auditLog,
} from '../utils/sessionStore.js';
import { rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Message, Session } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.codeyang', 'sessions');

describe('sessionStore', () => {
  const messages: Message[] = [
    { role: 'user', content: 'Hello, write a test' },
    { role: 'assistant', content: 'I will write a test for you.' },
  ];

  beforeEach(async () => {
    // Clean up sessions before each test
    await rm(SESSIONS_DIR, { recursive: true, force: true }).catch(() => {});
    await mkdir(SESSIONS_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup audit log between tests to avoid interference
    await rm(join(homedir(), '.codeyang', 'audit.log'), { force: true }).catch(() => {});
    // Remove oversized / temporary test JSON files left by importSessionFromFile tests
    const codeyangDir = join(homedir(), '.codeyang');
    const entries = await readdir(codeyangDir).catch(() => []);
    for (const entry of entries) {
      if (entry.startsWith('test-') && entry.endsWith('.json')) {
        await rm(join(codeyangDir, entry), { force: true }).catch(() => {});
      }
    }
  });

  // ── Existing CRUD tests ──

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

  it('updates an existing session with same id', async () => {
    const id = await saveSession(messages);
    const newMessages: Message[] = [
      { role: 'user', content: 'Updated message' },
      { role: 'assistant', content: 'Updated response' },
    ];
    const updatedId = await saveSession(newMessages, id);
    expect(updatedId).toBe(id);
    const session = await loadSession(id);
    expect(session).not.toBeNull();
    expect(session!.messages[0].content).toBe('Updated message');
  });

  // ── validateSession tests ──

  it('validateSession: returns errors for null data', () => {
    const errors = validateSession(null);
    expect(errors).toContain('Data must be a non-null, non-array object');
  });

  it('validateSession: returns errors for array data', () => {
    const errors = validateSession([]);
    expect(errors).toContain('Data must be a non-null, non-array object');
  });

  it('validateSession: returns errors for string data', () => {
    const errors = validateSession('not-an-object');
    expect(errors).toContain('Data must be a non-null, non-array object');
  });

  it('validateSession: returns errors for missing id', () => {
    const errors = validateSession({ messages: [] });
    expect(errors).toContain('"id" must be a non-empty string');
  });

  it('validateSession: returns errors for empty id', () => {
    const errors = validateSession({ id: '', messages: [] });
    expect(errors).toContain('"id" must be a non-empty string');
  });

  it('validateSession: returns errors for missing messages', () => {
    const errors = validateSession({ id: 'test' });
    expect(errors).toContain('"messages" must be an array');
  });

  it('validateSession: returns errors for non-array messages', () => {
    const errors = validateSession({ id: 'test', messages: 'not-array' });
    expect(errors).toContain('"messages" must be an array');
  });

  it('validateSession: returns errors for message with missing role', () => {
    const errors = validateSession({ id: 'test', messages: [{ content: 'hello' }] });
    expect(errors).toContain('messages[0]: missing "role" field');
  });

  it('validateSession: returns errors for invalid role', () => {
    const errors = validateSession({ id: 'test', messages: [{ role: 'admin', content: 'hello' }] });
    expect(errors).toContain('messages[0]: invalid role "admin"');
  });

  it('validateSession: returns errors for non-string content', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'user', content: 42 }],
    });
    expect(errors).toContain('messages[0]: "content" must be a string or null');
  });

  it('validateSession: passes with null content', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', content: null }],
    });
    expect(errors).toHaveLength(0);
  });

  it('validateSession: returns errors for non-array toolCalls', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', toolCalls: 'invalid' }],
    });
    expect(errors).toContain('messages[0]: "toolCalls" must be an array');
  });

  it('validateSession: returns errors for invalid tool name', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', toolCalls: [{ name: '', args: {} }] }],
    });
    expect(errors).toContain('messages[0].toolCalls[0]: invalid tool name ""');
  });

  it('validateSession: returns errors for non-object tool call', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', toolCalls: ['string-not-object'] }],
    });
    expect(errors).toContain('messages[0].toolCalls[0]: must be an object');
  });

  it('validateSession: returns errors for non-object toolCall args', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', toolCalls: [{ name: 'BashTool', args: 'string' }] }],
    });
    expect(errors).toContain('messages[0].toolCalls[0]: "args" must be an object');
  });

  it('validateSession: returns errors for non-array toolResults', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', toolResults: 'invalid' }],
    });
    expect(errors).toContain('messages[0]: "toolResults" must be an array');
  });

  it('validateSession: returns errors for non-object in toolResults', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', toolResults: ['string'] }],
    });
    expect(errors).toContain('messages[0].toolResults[0]: must be an object');
  });

  it('validateSession: returns errors for missing tool result output', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'assistant', toolResults: [{}] }],
    });
    expect(errors).toContain('messages[0].toolResults[0]: missing "output" string');
  });

  it('validateSession: returns errors for non-string title', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      title: 42,
    });
    expect(errors).toContain('"title" must be a string');
  });

  it('validateSession: returns errors for invalid createdAt date', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      createdAt: 'not-a-date',
    });
    expect(errors).toContain('"createdAt" must be a valid ISO date string');
  });

  it('validateSession: returns errors for invalid updatedAt date', () => {
    const errors = validateSession({
      id: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      updatedAt: 'invalid-date',
    });
    expect(errors).toContain('"updatedAt" must be a valid ISO date string');
  });

  it('validateSession: passes for valid session', () => {
    const errors = validateSession({
      id: 'test-123',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world', toolCalls: [{ name: 'BashTool', args: {} }] },
      ],
      title: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('validateSession: returns multiple errors at once', () => {
    const errors = validateSession({
      id: '',
      messages: 'not-array',
      title: 99,
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  // ── importSession tests ──

  it('importSession: rejects invalid session', async () => {
    const invalid = { id: '', messages: 'bad' } as unknown as Session;
    await expect(importSession(invalid)).rejects.toThrow('Session validation failed');
  });

  it('importSession: accepts valid session', async () => {
    const valid: Session = {
      id: 'import-test-1',
      title: 'Import Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
    };
    const id = await importSession(valid);
    expect(id).toBe('import-test-1');
    const loaded = await loadSession(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(2);
  });

  // ── importSessionFromFile tests ──

  it('importSessionFromFile: rejects path outside ~/.codeyang/', async () => {
    await expect(importSessionFromFile('/nonexistent/path.json')).rejects.toThrow('Cannot access session file');
  });

  it('importSessionFromFile: throws for nonexistent file inside whitelist', async () => {
    await expect(importSessionFromFile(join(homedir(), '.codeyang', 'no-such-file.json'))).rejects.toThrow(
      'Cannot access session file',
    );
  });

  it('importSessionFromFile: throws for invalid JSON', async () => {
    const filePath = join(homedir(), '.codeyang', 'test-bad-json.json');
    await writeFile(filePath, '{bad json}', 'utf-8');
    await expect(importSessionFromFile(filePath)).rejects.toThrow('Invalid JSON in session file');
  });

  it('importSessionFromFile: throws for oversized file', async () => {
    const filePath = join(homedir(), '.codeyang', 'test-oversized.json');
    // Write a JSON larger than 10 MB
    const bigContent = JSON.stringify({ id: 'x', messages: [{ role: 'user', content: 'a'.repeat(11 * 1024 * 1024) }] });
    await writeFile(filePath, bigContent, 'utf-8');
    await expect(importSessionFromFile(filePath)).rejects.toThrow('Session file too large');
  });

  it('importSessionFromFile: rejects invalid tools in file', async () => {
    const filePath = join(homedir(), '.codeyang', 'test-bad-tools.json');
    await writeFile(
      filePath,
      JSON.stringify({
        id: 'bad-tools',
        messages: [{ role: 'assistant', toolCalls: [{ name: '', args: {} }] }],
      }),
      'utf-8',
    );
    await expect(importSessionFromFile(filePath)).rejects.toThrow('Session validation failed');
  });

  it('importSessionFromFile: accepts valid file', async () => {
    const filePath = join(homedir(), '.codeyang', 'test-valid.json');
    await writeFile(
      filePath,
      JSON.stringify({
        id: 'valid-import',
        title: 'Valid Import',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'world' },
        ],
      }),
      'utf-8',
    );
    const id = await importSessionFromFile(filePath);
    expect(id).toBe('valid-import');
    const loaded = await loadSession(id);
    expect(loaded).not.toBeNull();
  });

  // ── Export / Import round-trip ──

  it('exports and imports a session round-trip', async () => {
    const id = await saveSession(messages);
    const exported = await exportSessionAsJson(id);
    expect(exported.id).toBe(id);

    // Delete original
    await deleteSession(id);
    expect(await loadSession(id)).toBeNull();

    // Re-import
    const newId = await importSession(exported);
    expect(newId).toBe(id);
    const loaded = await loadSession(id);
    expect(loaded).not.toBeNull();
  });

  it('exportSessionAsMarkdown returns markdown string', async () => {
    const id = await saveSession(messages);
    const md = await exportSessionAsMarkdown(id);
    expect(md).toContain('# CodeYang Session');
    expect(md).toContain('## User');
    expect(md).toContain('## CodeYang');
  });

  it('exportSessionAsMarkdown throws for missing session', async () => {
    await expect(exportSessionAsMarkdown('nonexistent')).rejects.toThrow('Session not found');
  });

  // ── sessionToMarkdown tests ──

  it('sessionToMarkdown includes tool calls', () => {
    const session: Session = {
      id: 'test',
      title: 'Tool Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          role: 'assistant',
          content: 'Running tool',
          toolCalls: [{ name: 'BashTool', args: { cmd: 'echo hi' } }],
        },
      ],
    };
    const md = sessionToMarkdown(session);
    expect(md).toContain('Tool call');
    expect(md).toContain('BashTool');
  });

  it('sessionToMarkdown handles system messages', () => {
    const session: Session = {
      id: 'test',
      title: 'System Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{ role: 'system', content: 'System notice' }],
    };
    const md = sessionToMarkdown(session);
    expect(md).toContain('### System');
    expect(md).toContain('System notice');
  });

  it('sessionToMarkdown handles empty assistant content', () => {
    const session: Session = {
      id: 'test',
      title: 'Empty',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{ role: 'assistant', content: '' }],
    };
    const md = sessionToMarkdown(session);
    expect(md).toContain('CodeYang');
  });

  // ── searchSessions tests ──

  it('searchSessions filters by query', async () => {
    await saveSession([{ role: 'user', content: 'Alpha test' }]);
    await saveSession([{ role: 'user', content: 'Beta test' }], 'beta-session');
    const results = await searchSessions('Alpha');
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.title.toLowerCase()).toContain('alpha');
    }
  });

  it('searchSessions filters by recency', async () => {
    await saveSession([{ role: 'user', content: 'Recent' }]);
    const results = await searchSessions(undefined, 1);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  // ── auditLog tests ──

  it('auditLog writes to file without throwing', async () => {
    await expect(
      auditLog({
        action: 'test',
        command: 'echo hello',
        cwd: '/tmp',
        result: 'ok',
      }),
    ).resolves.toBeUndefined();

    const logPath = join(homedir(), '.codeyang', 'audit.log');
    const content = await readFile(logPath, 'utf-8');
    expect(content).toContain('"action":"test"');
    expect(content).toContain('"command":"echo hello"');
    expect(content).toContain('"cwd":"/tmp"');
    expect(content).toContain('"result":"ok"');
  });

  it('auditLog appends multiple entries', async () => {
    await auditLog({ action: 'first' });
    await auditLog({ action: 'second' });
    const logPath = join(homedir(), '.codeyang', 'audit.log');
    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"action":"first"');
    expect(lines[1]).toContain('"action":"second"');
  });

  it('auditLog never throws on error', async () => {
    // The auditLog catches all errors internally, so it should never throw
    await expect(
      auditLog({
        action: 'should_not_throw',
        details: 'testing error handling',
      }),
    ).resolves.toBeUndefined();
  });
});
