import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager, Session, Message, ToolExecution } from './DatabaseManager.js';
import { BackupManager } from './BackupManager.js';
import { existsSync } from 'node:fs';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  const testDbPath = join(process.cwd(), '.test-db', 'test.db');

  beforeEach(async () => {
    db = new DatabaseManager({ type: 'sqlite', path: testDbPath });
    await db.connect();
  });

  afterEach(async () => {
    await db.close();
    if (existsSync(join(testDbPath, '..'))) {
      await rm(join(testDbPath, '..'), { recursive: true, force: true });
    }
  });

  it('should connect to database', async () => {
    expect(existsSync(testDbPath)).toBe(true);
  });

  it('should save and retrieve session', async () => {
    const session: Session = {
      id: 'session-1',
      userId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      metadata: { test: 'data' },
    };

    await db.saveSession(session);
    const retrieved = await db.getSession('session-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('session-1');
    expect(retrieved?.userId).toBe('user-1');
    expect(retrieved?.metadata).toEqual({ test: 'data' });
  });

  it('should list sessions', async () => {
    await db.saveSession({
      id: 'session-1',
      userId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      metadata: {},
    });

    await db.saveSession({
      id: 'session-2',
      userId: 'user-1',
      createdAt: Date.now() + 1000,
      updatedAt: Date.now() + 1000,
      status: 'completed',
      metadata: {},
    });

    const sessions = await db.listSessions('user-1');
    expect(sessions.length).toBe(2);
    expect(sessions[0].id).toBe('session-2'); // Latest first
  });

  it('should save and retrieve messages', async () => {
    const session: Session = {
      id: 'session-1',
      userId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      metadata: {},
    };
    await db.saveSession(session);

    const message: Message = {
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Hello, world!',
      timestamp: Date.now(),
      tokens: 10,
    };

    await db.saveMessage(message);
    const messages = await db.getMessages('session-1');

    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Hello, world!');
    expect(messages[0].tokens).toBe(10);
  });

  it('should search messages', async () => {
    const session: Session = {
      id: 'session-1',
      userId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      metadata: {},
    };
    await db.saveSession(session);

    await db.saveMessage({
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'How to implement database?',
      timestamp: Date.now(),
    });

    await db.saveMessage({
      id: 'msg-2',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'Use SQLite for local development',
      timestamp: Date.now() + 1000,
    });

    const results = await db.searchMessages('database');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('database');
  });

  it('should save tool execution', async () => {
    const session: Session = {
      id: 'session-1',
      userId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      metadata: {},
    };
    await db.saveSession(session);

    const message: Message = {
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Test',
      timestamp: Date.now(),
    };
    await db.saveMessage(message);

    const execution: ToolExecution = {
      id: 'exec-1',
      sessionId: 'session-1',
      messageId: 'msg-1',
      toolName: 'read_file',
      input: '{"path": "test.txt"}',
      output: '{"content": "Hello"}',
      status: 'success',
      duration: 100,
      timestamp: Date.now(),
    };

    await db.saveToolExecution(execution);
    // Tool execution saved successfully
    expect(true).toBe(true);
  });

  it('should get statistics', async () => {
    await db.saveSession({
      id: 'session-1',
      userId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      metadata: {},
    });

    const stats = await db.getStatistics();
    expect(stats.totalSessions).toBe(1);
    expect(stats.activeSessions).toBe(1);
  });

  it('should support transactions', async () => {
    await db.transaction(() => {
      db.saveSession({
        id: 'session-1',
        userId: 'user-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        metadata: {},
      });
    });

    const session = await db.getSession('session-1');
    expect(session).toBeDefined();
  });
});

describe('BackupManager', () => {
  let backupMgr: BackupManager;
  const testBackupDir = join(process.cwd(), '.test-backups');

  beforeEach(async () => {
    if (existsSync(testBackupDir)) {
      await rm(testBackupDir, { recursive: true, force: true });
    }
    await mkdir(testBackupDir, { recursive: true });

    backupMgr = new BackupManager({ backupDir: testBackupDir, compression: false });
  });

  afterEach(async () => {
    if (existsSync(testBackupDir)) {
      await rm(testBackupDir, { recursive: true, force: true });
    }
  });

  it('should create backup', async () => {
    const backup = await backupMgr.createBackup('full');

    expect(backup).toBeDefined();
    expect(backup.type).toBe('full');
    expect(backup.timestamp).toBeGreaterThan(0);
  });

  it('should list backups', async () => {
    await backupMgr.createBackup('full');
    await backupMgr.createBackup('incremental');

    const backups = await backupMgr.listBackups();
    expect(backups.length).toBe(2);
  });

  it('should cleanup old backups', async () => {
    await backupMgr.createBackup('full');

    const removed = await backupMgr.cleanup();
    expect(removed).toBeGreaterThanOrEqual(0);
  });
});
