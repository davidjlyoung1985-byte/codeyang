/**
 * Database Manager
 *
 * Manages persistent storage using SQLite for local development
 * and PostgreSQL for production environments.
 *
 * Features:
 * - Session persistence
 * - Message history
 * - Tool execution logs
 * - Configuration storage
 * - Full-text search
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { logger } from '../utils/logger.js';

export interface DatabaseConfig {
  type: 'sqlite' | 'postgresql';
  path?: string; // For SQLite
  host?: string; // For PostgreSQL
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolExecution {
  id: string;
  sessionId: string;
  messageId: string;
  toolName: string;
  input: string;
  output: string;
  status: 'success' | 'error';
  duration: number;
  timestamp: number;
}

/**
 * Database Manager using SQLite
 */
export class DatabaseManager {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;
  private initialized = false;

  constructor(config: DatabaseConfig = { type: 'sqlite' }) {
    this.config = config;
  }

  /**
   * Initialize database connection
   */
  async connect(): Promise<void> {
    if (this.initialized) return;

    if (this.config.type === 'sqlite') {
      await this.connectSQLite();
    } else {
      throw new Error('PostgreSQL not yet implemented. Use SQLite for now.');
    }

    await this.migrate();
    this.initialized = true;
    logger.info('[DatabaseManager] Connected successfully');
  }

  /**
   * Connect to SQLite
   */
  private async connectSQLite(): Promise<void> {
    const dbPath = this.config.path || join(process.cwd(), '.codeyang', 'database.db');
    const dbDir = join(dbPath, '..');

    // Ensure directory exists
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.db.pragma('foreign_keys = ON'); // Enable foreign key constraints

    logger.info(`[DatabaseManager] SQLite database at ${dbPath}`);
  }

  /**
   * Run migrations
   */
  private async migrate(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'failed')),
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tokens INTEGER,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // Tool executions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_executions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'error')),
        duration INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tool_executions_session_id ON tool_executions(session_id);
    `);

    // Full-text search for messages
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        id,
        content,
        content='messages',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.rowid;
        INSERT INTO messages_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;
    `);

    logger.info('[DatabaseManager] Database schema migrated');
  }

  /**
   * Save session
   */
  async saveSession(session: Session): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, created_at, updated_at, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        status = excluded.status,
        metadata = excluded.metadata
    `);

    stmt.run(
      session.id,
      session.userId,
      session.createdAt,
      session.updatedAt,
      session.status,
      JSON.stringify(session.metadata),
    );

    logger.debug(`[DatabaseManager] Saved session: ${session.id}`);
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.db) throw new Error('Database not connected');

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(sessionId) as any;

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      metadata: JSON.parse(row.metadata),
    };
  }

  /**
   * List sessions
   */
  async listSessions(userId?: string, limit: number = 50, offset: number = 0): Promise<Session[]> {
    if (!this.db) throw new Error('Database not connected');

    const stmt = userId
      ? this.db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      : this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?');

    const rows = userId ? stmt.all(userId, limit, offset) : stmt.all(limit, offset);

    return (rows as any[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      metadata: JSON.parse(row.metadata),
    }));
  }

  /**
   * Save message
   */
  async saveMessage(message: Message): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp, tokens, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.sessionId,
      message.role,
      message.content,
      message.timestamp,
      message.tokens || null,
      JSON.stringify(message.metadata || {}),
    );

    logger.debug(`[DatabaseManager] Saved message: ${message.id}`);
  }

  /**
   * Get messages for session
   */
  async getMessages(sessionId: string, limit?: number): Promise<Message[]> {
    if (!this.db) throw new Error('Database not connected');

    const stmt = limit
      ? this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?')
      : this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC');

    const rows = limit ? stmt.all(sessionId, limit) : stmt.all(sessionId);

    return (rows as any[]).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      tokens: row.tokens,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  }

  /**
   * Search messages
   */
  async searchMessages(query: string, limit: number = 50): Promise<Message[]> {
    if (!this.db) throw new Error('Database not connected');

    const stmt = this.db.prepare(`
      SELECT m.* FROM messages m
      INNER JOIN messages_fts fts ON m.id = fts.id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    const rows = stmt.all(query, limit);

    return (rows as any[]).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      tokens: row.tokens,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  }

  /**
   * Save tool execution
   */
  async saveToolExecution(execution: ToolExecution): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const stmt = this.db.prepare(`
      INSERT INTO tool_executions (id, session_id, message_id, tool_name, input, output, status, duration, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.sessionId,
      execution.messageId,
      execution.toolName,
      execution.input,
      execution.output,
      execution.status,
      execution.duration,
      execution.timestamp,
    );

    logger.debug(`[DatabaseManager] Saved tool execution: ${execution.id}`);
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalSessions: number;
    totalMessages: number;
    totalToolExecutions: number;
    activeSessions: number;
  }> {
    if (!this.db) throw new Error('Database not connected');

    const result = this.db
      .prepare(
        `
      SELECT
        (SELECT COUNT(*) FROM sessions) as total_sessions,
        (SELECT COUNT(*) FROM messages) as total_messages,
        (SELECT COUNT(*) FROM tool_executions) as total_tool_executions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'active') as active_sessions
    `,
      )
      .get() as any;

    return {
      totalSessions: result.total_sessions,
      totalMessages: result.total_messages,
      totalToolExecutions: result.total_tool_executions,
      activeSessions: result.active_sessions,
    };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      logger.info('[DatabaseManager] Database connection closed');
    }
  }

  /**
   * Run in transaction
   */
  async transaction<T>(fn: () => T): Promise<T> {
    if (!this.db) throw new Error('Database not connected');

    const transaction = this.db.transaction(fn);
    return transaction();
  }
}

// Singleton instance
export const databaseManager = new DatabaseManager();
