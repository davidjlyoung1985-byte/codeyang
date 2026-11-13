/**
 * Session Recovery Manager
 *
 * Provides automatic checkpoint creation and crash recovery for agent sessions.
 * Prevents data loss by periodically saving session state.
 */

import { writeFile, readFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { logger } from '../utils/logger.js';
import type { LLMMessage } from '../agent/LLMClient.js';

export interface SessionCheckpoint {
  sessionId: string;
  timestamp: number;
  messages: LLMMessage[];
  context: Record<string, unknown>;
  metadata: {
    model: string;
    totalTokens: number;
    turnCount: number;
  };
}

export interface RecoveryOptions {
  checkpointDir?: string;
  autoSaveInterval?: number; // milliseconds
  maxCheckpoints?: number; // per session
  checkpointRetention?: number; // milliseconds (how long to keep old checkpoints)
}

/**
 * Manages session checkpoints for crash recovery
 */
export class SessionRecoveryManager {
  private checkpointDir: string;
  private autoSaveInterval: number;
  private maxCheckpoints: number;
  private checkpointRetention: number;
  private autoSaveTimers = new Map<string, NodeJS.Timeout>();

  constructor(options: RecoveryOptions = {}) {
    this.checkpointDir = options.checkpointDir || join(process.cwd(), '.codeyang', 'checkpoints');
    this.autoSaveInterval = options.autoSaveInterval ?? 60_000; // 1 minute default
    this.maxCheckpoints = options.maxCheckpoints ?? 10;
    this.checkpointRetention = options.checkpointRetention ?? 7 * 24 * 60 * 60 * 1000; // 7 days
    this.ensureCheckpointDir();
  }

  private async ensureCheckpointDir(): Promise<void> {
    if (!existsSync(this.checkpointDir)) {
      await mkdir(this.checkpointDir, { recursive: true });
      logger.info(`[SessionRecovery] Created checkpoint directory: ${this.checkpointDir}`);
    }
  }

  /**
   * Create a checkpoint for the current session state
   */
  async createCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
    try {
      await this.ensureCheckpointDir();

      const filename = `${checkpoint.sessionId}_${checkpoint.timestamp}.json`;
      const filepath = join(this.checkpointDir, filename);

      await writeFile(filepath, JSON.stringify(checkpoint, null, 2), 'utf-8');
      logger.info(`[SessionRecovery] Checkpoint saved: ${filename}`);

      // Clean up old checkpoints
      await this.pruneOldCheckpoints(checkpoint.sessionId);
    } catch (error) {
      logger.error('[SessionRecovery] Failed to create checkpoint:', error);
      throw error;
    }
  }

  /**
   * Recover session from the most recent checkpoint
   */
  async recoverFromCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    try {
      const checkpoints = await this.listCheckpoints(sessionId);
      if (checkpoints.length === 0) {
        logger.warn(`[SessionRecovery] No checkpoints found for session: ${sessionId}`);
        return null;
      }

      // Get the most recent checkpoint
      const latest = checkpoints[checkpoints.length - 1];
      const filepath = join(this.checkpointDir, latest);
      const content = await readFile(filepath, 'utf-8');
      const checkpoint: SessionCheckpoint = JSON.parse(content);

      logger.info(`[SessionRecovery] Recovered checkpoint: ${latest} (${checkpoint.metadata.turnCount} turns)`);
      return checkpoint;
    } catch (error) {
      logger.error('[SessionRecovery] Failed to recover checkpoint:', error);
      return null;
    }
  }

  /**
   * List all checkpoints for a session (sorted by timestamp)
   */
  async listCheckpoints(sessionId: string): Promise<string[]> {
    try {
      const files = await readdir(this.checkpointDir);
      return files
        .filter((f) => f.startsWith(`${sessionId}_`) && f.endsWith('.json'))
        .sort((a, b) => {
          const tsA = parseInt(a.split('_')[1].replace('.json', ''));
          const tsB = parseInt(b.split('_')[1].replace('.json', ''));
          return tsA - tsB;
        });
    } catch (error) {
      logger.error('[SessionRecovery] Failed to list checkpoints:', error);
      return [];
    }
  }

  /**
   * Delete old checkpoints to save space
   */
  private async pruneOldCheckpoints(sessionId: string): Promise<void> {
    try {
      const checkpoints = await this.listCheckpoints(sessionId);

      // Remove checkpoints beyond max count
      if (checkpoints.length > this.maxCheckpoints) {
        const toRemove = checkpoints.slice(0, checkpoints.length - this.maxCheckpoints);
        for (const file of toRemove) {
          await unlink(join(this.checkpointDir, file));
          logger.info(`[SessionRecovery] Pruned old checkpoint: ${file}`);
        }
      }

      // Remove checkpoints older than retention period
      const now = Date.now();
      for (const file of checkpoints) {
        const filepath = join(this.checkpointDir, file);
        const stats = await stat(filepath);
        if (now - stats.mtimeMs > this.checkpointRetention) {
          await unlink(filepath);
          logger.info(`[SessionRecovery] Pruned expired checkpoint: ${file}`);
        }
      }
    } catch (error) {
      logger.error('[SessionRecovery] Failed to prune checkpoints:', error);
    }
  }

  /**
   * Enable auto-save for a session
   */
  enableAutoSave(sessionId: string, getCheckpointData: () => Promise<SessionCheckpoint>): void {
    // Clear existing timer if any
    this.disableAutoSave(sessionId);

    const timer = setInterval(async () => {
      try {
        const checkpoint = await getCheckpointData();
        await this.createCheckpoint(checkpoint);
      } catch (error) {
        logger.error(`[SessionRecovery] Auto-save failed for session ${sessionId}:`, error);
      }
    }, this.autoSaveInterval);

    // Allow process to exit even with active timer
    timer.unref();

    this.autoSaveTimers.set(sessionId, timer);
    logger.info(`[SessionRecovery] Auto-save enabled for session: ${sessionId} (interval: ${this.autoSaveInterval}ms)`);
  }

  /**
   * Disable auto-save for a session
   */
  disableAutoSave(sessionId: string): void {
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
      logger.info(`[SessionRecovery] Auto-save disabled for session: ${sessionId}`);
    }
  }

  /**
   * Clean up all resources
   */
  cleanup(): void {
    for (const [sessionId, timer] of this.autoSaveTimers.entries()) {
      clearInterval(timer);
      logger.info(`[SessionRecovery] Cleaned up auto-save timer for session: ${sessionId}`);
    }
    this.autoSaveTimers.clear();
  }

  /**
   * Delete all checkpoints for a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      this.disableAutoSave(sessionId);
      const checkpoints = await this.listCheckpoints(sessionId);
      for (const file of checkpoints) {
        await unlink(join(this.checkpointDir, file));
      }
      logger.info(`[SessionRecovery] Deleted all checkpoints for session: ${sessionId}`);
    } catch (error) {
      logger.error(`[SessionRecovery] Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }
}

// Singleton instance
export const sessionRecovery = new SessionRecoveryManager();
