/**
 * RecoveryManager - 高级中断恢复系统
 *
 * 功能：
 * 1. 自动保存执行检查点
 * 2. 检测异常中断
 * 3. 从最近检查点恢复执行
 * 4. 支持部分完成的工具调用恢复
 */

import { writeFile, readFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface Checkpoint {
  id: string;
  timestamp: number;
  sessionId: string;
  turnIndex: number;

  // 对话状态
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    toolResults?: Array<{ output: string; isError: boolean }>;
  }>;

  // 工具执行状态
  toolExecutionState: {
    completedTools: string[];
    pendingTools: Array<{ name: string; args: Record<string, unknown> }>;
    failedTools: Array<{ name: string; error: string }>;
  };

  // 文件系统状态
  fileSystemSnapshot: {
    modifiedFiles: string[];
    createdFiles: string[];
    deletedFiles: string[];
  };

  // 上下文信息
  context: {
    cwd: string;
    model: string;
    apiKey?: string;
    config: Record<string, unknown>;
  };

  // 恢复元数据
  recoveryMetadata: {
    canResume: boolean;
    resumeReason?: string;
    interruptionType?: 'user' | 'network' | 'crash' | 'timeout';
  };
}

export interface RecoveryOptions {
  checkpointDir?: string;
  autoSaveInterval?: number; // ms
  maxCheckpoints?: number;
  enableFileSystemTracking?: boolean;
}

export class RecoveryManager {
  private checkpointDir: string;
  private autoSaveInterval: number;
  private maxCheckpoints: number;
  private enableFileSystemTracking: boolean;

  private currentCheckpoint: Checkpoint | null = null;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private fileSystemChanges: Set<string> = new Set();

  constructor(options: RecoveryOptions = {}) {
    this.checkpointDir = options.checkpointDir || join(homedir(), '.codeyang', 'checkpoints');
    this.autoSaveInterval = options.autoSaveInterval || 30000; // 30秒
    this.maxCheckpoints = options.maxCheckpoints || 10;
    this.enableFileSystemTracking = options.enableFileSystemTracking ?? true;
  }

  /**
   * 初始化恢复管理器
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.checkpointDir)) {
      await mkdir(this.checkpointDir, { recursive: true });
    }

    // 清理过期检查点
    await this.cleanupOldCheckpoints();
  }

  /**
   * 创建新检查点
   */
  async createCheckpoint(data: Omit<Checkpoint, 'id' | 'timestamp'>): Promise<string> {
    const checkpoint: Checkpoint = {
      ...data,
      id: this.generateCheckpointId(),
      timestamp: Date.now(),
    };

    this.currentCheckpoint = checkpoint;

    const filePath = join(this.checkpointDir, `${checkpoint.id}.json`);
    await writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');

    console.log(`[Recovery] Checkpoint saved: ${checkpoint.id}`);
    return checkpoint.id;
  }

  /**
   * 启动自动保存
   */
  startAutoSave(getCheckpointData: () => Omit<Checkpoint, 'id' | 'timestamp'>): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(async () => {
      try {
        const data = getCheckpointData();
        await this.createCheckpoint(data);
      } catch (error) {
        console.error('[Recovery] Auto-save failed:', error);
      }
    }, this.autoSaveInterval);
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * 查找最近的可恢复检查点
   */
  async findLatestRecoverableCheckpoint(sessionId?: string): Promise<Checkpoint | null> {
    const checkpoints = await this.listCheckpoints();

    if (checkpoints.length === 0) {
      return null;
    }

    // 过滤可恢复的检查点
    const recoverableCheckpoints = checkpoints.filter((cp) => {
      if (!cp.recoveryMetadata.canResume) return false;
      if (sessionId && cp.sessionId !== sessionId) return false;
      return true;
    });

    if (recoverableCheckpoints.length === 0) {
      return null;
    }

    // 返回最新的
    return recoverableCheckpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  /**
   * 从检查点恢复
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<Checkpoint> {
    const filePath = join(this.checkpointDir, `${checkpointId}.json`);

    if (!existsSync(filePath)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const content = await readFile(filePath, 'utf-8');
    const checkpoint: Checkpoint = JSON.parse(content);

    this.currentCheckpoint = checkpoint;
    console.log(`[Recovery] Restored from checkpoint: ${checkpointId}`);

    return checkpoint;
  }

  /**
   * 列出所有检查点
   */
  async listCheckpoints(): Promise<Checkpoint[]> {
    if (!existsSync(this.checkpointDir)) {
      return [];
    }

    const { readdir } = await import('node:fs/promises');
    const files = await readdir(this.checkpointDir);

    const checkpoints: Checkpoint[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = join(this.checkpointDir, file);
        const content = await readFile(filePath, 'utf-8');
        const checkpoint: Checkpoint = JSON.parse(content);
        checkpoints.push(checkpoint);
      } catch (error) {
        console.warn(`[Recovery] Failed to load checkpoint: ${file}`, error);
      }
    }

    return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 删除检查点
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const filePath = join(this.checkpointDir, `${checkpointId}.json`);

    if (existsSync(filePath)) {
      await unlink(filePath);
      console.log(`[Recovery] Deleted checkpoint: ${checkpointId}`);
    }
  }

  /**
   * 清理旧检查点（保留最新的 N 个）
   */
  async cleanupOldCheckpoints(): Promise<void> {
    const checkpoints = await this.listCheckpoints();

    if (checkpoints.length <= this.maxCheckpoints) {
      return;
    }

    // 删除最旧的检查点
    const toDelete = checkpoints.slice(this.maxCheckpoints);
    for (const checkpoint of toDelete) {
      await this.deleteCheckpoint(checkpoint.id);
    }

    console.log(`[Recovery] Cleaned up ${toDelete.length} old checkpoints`);
  }

  /**
   * 标记文件系统更改
   */
  trackFileChange(filePath: string): void {
    if (this.enableFileSystemTracking) {
      this.fileSystemChanges.add(filePath);
    }
  }

  /**
   * 获取文件系统更改
   */
  getFileSystemChanges(): string[] {
    return Array.from(this.fileSystemChanges);
  }

  /**
   * 清除文件系统更改跟踪
   */
  clearFileSystemTracking(): void {
    this.fileSystemChanges.clear();
  }

  /**
   * 生成检查点 ID
   */
  private generateCheckpointId(): string {
    return `ckpt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取当前检查点
   */
  getCurrentCheckpoint(): Checkpoint | null {
    return this.currentCheckpoint;
  }

  /**
   * 检测是否有待恢复的会话
   */
  async detectUnfinishedSessions(): Promise<Checkpoint[]> {
    const checkpoints = await this.listCheckpoints();

    // 查找最近 1 小时内的可恢复检查点
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return checkpoints.filter((cp) => cp.timestamp > oneHourAgo && cp.recoveryMetadata.canResume);
  }
}
