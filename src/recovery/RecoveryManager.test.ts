import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecoveryManager, type Checkpoint } from './RecoveryManager.js';
import { rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('RecoveryManager', () => {
  let recoveryManager: RecoveryManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `recovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    recoveryManager = new RecoveryManager({
      checkpointDir: testDir,
      autoSaveInterval: 1000,
      maxCheckpoints: 5,
    });

    await recoveryManager.initialize();
  });

  afterEach(async () => {
    recoveryManager.stopAutoSave();
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint', async () => {
      const checkpointData: Omit<Checkpoint, 'id' | 'timestamp'> = {
        sessionId: 'test-session',
        turnIndex: 1,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      };

      const checkpointId = await recoveryManager.createCheckpoint(checkpointData);

      expect(checkpointId).toBeTruthy();
      expect(checkpointId).toMatch(/^ckpt-\d+-[a-z0-9]+$/);
    });

    it('should save checkpoint to disk', async () => {
      const checkpointData: Omit<Checkpoint, 'id' | 'timestamp'> = {
        sessionId: 'test-session',
        turnIndex: 1,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      };

      const checkpointId = await recoveryManager.createCheckpoint(checkpointData);
      const checkpointFile = join(testDir, `${checkpointId}.json`);

      expect(existsSync(checkpointFile)).toBe(true);
    });
  });

  describe('listCheckpoints', () => {
    it('should list all checkpoints', async () => {
      await recoveryManager.createCheckpoint({
        sessionId: 'session-1',
        turnIndex: 1,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      await recoveryManager.createCheckpoint({
        sessionId: 'session-2',
        turnIndex: 2,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      const checkpoints = await recoveryManager.listCheckpoints();
      expect(checkpoints.length).toBe(2);
    });

    it('should sort checkpoints by timestamp descending', async () => {
      await recoveryManager.createCheckpoint({
        sessionId: 'session-1',
        turnIndex: 1,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await recoveryManager.createCheckpoint({
        sessionId: 'session-2',
        turnIndex: 2,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      const checkpoints = await recoveryManager.listCheckpoints();
      expect(checkpoints[0].sessionId).toBe('session-2');
      expect(checkpoints[1].sessionId).toBe('session-1');
    });
  });

  describe('restoreFromCheckpoint', () => {
    it('should restore a checkpoint', async () => {
      const checkpointId = await recoveryManager.createCheckpoint({
        sessionId: 'test-session',
        turnIndex: 1,
        messages: [{ role: 'user', content: 'Test' }],
        toolExecutionState: {
          completedTools: ['ReadTool'],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      const restored = await recoveryManager.restoreFromCheckpoint(checkpointId);

      expect(restored.sessionId).toBe('test-session');
      expect(restored.turnIndex).toBe(1);
      expect(restored.messages.length).toBe(1);
      expect(restored.toolExecutionState.completedTools).toEqual(['ReadTool']);
    });

    it('should throw error for non-existent checkpoint', async () => {
      await expect(recoveryManager.restoreFromCheckpoint('non-existent-id')).rejects.toThrow('Checkpoint not found');
    });
  });

  describe('findLatestRecoverableCheckpoint', () => {
    it('should find the latest recoverable checkpoint', async () => {
      await recoveryManager.createCheckpoint({
        sessionId: 'session-1',
        turnIndex: 1,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await recoveryManager.createCheckpoint({
        sessionId: 'session-2',
        turnIndex: 2,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      const latest = await recoveryManager.findLatestRecoverableCheckpoint();
      expect(latest).toBeTruthy();
      expect(latest?.sessionId).toBe('session-2');
    });

    it('should filter by session ID', async () => {
      await recoveryManager.createCheckpoint({
        sessionId: 'session-1',
        turnIndex: 1,
        messages: [],
        toolExecutionState: {
          completedTools: [],
          pendingTools: [],
          failedTools: [],
        },
        fileSystemSnapshot: {
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
        },
        context: {
          cwd: process.cwd(),
          model: 'test-model',
          config: {},
        },
        recoveryMetadata: {
          canResume: true,
        },
      });

      const latest = await recoveryManager.findLatestRecoverableCheckpoint('session-1');
      expect(latest).toBeTruthy();
      expect(latest?.sessionId).toBe('session-1');

      const notFound = await recoveryManager.findLatestRecoverableCheckpoint('non-existent');
      expect(notFound).toBeNull();
    });
  });

  describe('cleanupOldCheckpoints', () => {
    it('should keep only maxCheckpoints', async () => {
      // Create 10 checkpoints
      for (let i = 0; i < 10; i++) {
        await recoveryManager.createCheckpoint({
          sessionId: `session-${i}`,
          turnIndex: i,
          messages: [],
          toolExecutionState: {
            completedTools: [],
            pendingTools: [],
            failedTools: [],
          },
          fileSystemSnapshot: {
            modifiedFiles: [],
            createdFiles: [],
            deletedFiles: [],
          },
          context: {
            cwd: process.cwd(),
            model: 'test-model',
            config: {},
          },
          recoveryMetadata: {
            canResume: true,
          },
        });
      }

      await recoveryManager.cleanupOldCheckpoints();

      const checkpoints = await recoveryManager.listCheckpoints();
      expect(checkpoints.length).toBe(5); // maxCheckpoints = 5
    });
  });

  describe('fileSystemTracking', () => {
    it('should track file changes', () => {
      recoveryManager.trackFileChange('/path/to/file1.ts');
      recoveryManager.trackFileChange('/path/to/file2.ts');

      const changes = recoveryManager.getFileSystemChanges();
      expect(changes).toContain('/path/to/file1.ts');
      expect(changes).toContain('/path/to/file2.ts');
      expect(changes.length).toBe(2);
    });

    it('should clear file tracking', () => {
      recoveryManager.trackFileChange('/path/to/file.ts');
      expect(recoveryManager.getFileSystemChanges().length).toBe(1);

      recoveryManager.clearFileSystemTracking();
      expect(recoveryManager.getFileSystemChanges().length).toBe(0);
    });
  });
});
