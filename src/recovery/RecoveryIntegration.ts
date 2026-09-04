/**
 * RecoveryIntegration - 将恢复管理器集成到 Agent 系统
 *
 * 功能：
 * 1. 在 Agent 运行时自动创建检查点
 * 2. 检测中断并提供恢复选项
 * 3. 从检查点恢复 Agent 状态
 */

import type { Agent } from '../agent/Agent.js';
import { RecoveryManager, type Checkpoint } from './RecoveryManager.js';
import type { Message, ToolCall, ToolResult } from '../types.js';

export interface RecoveryIntegrationOptions {
  agent: Agent;
  recoveryManager: RecoveryManager;
  autoCheckpointEnabled?: boolean;
  promptUserOnRecovery?: boolean;
}

export class RecoveryIntegration {
  private agent: Agent;
  private recoveryManager: RecoveryManager;
  private autoCheckpointEnabled: boolean;
  private promptUserOnRecovery: boolean;
  private sessionId: string;
  private currentTurnIndex = 0;

  constructor(options: RecoveryIntegrationOptions) {
    this.agent = options.agent;
    this.recoveryManager = options.recoveryManager;
    this.autoCheckpointEnabled = options.autoCheckpointEnabled ?? true;
    this.promptUserOnRecovery = options.promptUserOnRecovery ?? true;
    this.sessionId = this.generateSessionId();
  }

  /**
   * 初始化恢复集成
   */
  async initialize(): Promise<void> {
    await this.recoveryManager.initialize();

    // 检查是否有待恢复的会话
    const unfinishedSessions = await this.recoveryManager.detectUnfinishedSessions();

    if (unfinishedSessions.length > 0) {
      console.log(`\n[Recovery] Found ${unfinishedSessions.length} unfinished session(s).`);

      if (this.promptUserOnRecovery) {
        // 在实际使用中，这里应该通过 UI 提示用户
        console.log('[Recovery] Use /recovery list to view and /recovery restore <id> to resume.');
      }
    }

    // 启动自动检查点
    if (this.autoCheckpointEnabled) {
      this.startAutoCheckpoint();
    }
  }

  /**
   * 启动自动检查点
   */
  private startAutoCheckpoint(): void {
    this.recoveryManager.startAutoSave(() => this.captureCurrentState());
  }

  /**
   * 停止自动检查点
   */
  stopAutoCheckpoint(): void {
    this.recoveryManager.stopAutoSave();
  }

  /**
   * 捕获当前 Agent 状态
   */
  private captureCurrentState(): Omit<Checkpoint, 'id' | 'timestamp'> {
    const messages = this.agent.exportMessages();
    const context = {}; // Agent doesn't expose getContext, use empty object

    return {
      sessionId: this.sessionId,
      turnIndex: this.currentTurnIndex,
      messages: messages.map((msg: Message) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        toolCalls: msg.toolCalls?.map((tc: ToolCall) => ({
          name: tc.name,
          args: tc.args,
        })),
        toolResults: msg.toolResults?.map((tr: ToolResult) => ({
          output: tr.output,
          isError: tr.isError,
        })),
      })),
      toolExecutionState: {
        completedTools: this.extractCompletedTools(messages),
        pendingTools: [],
        failedTools: [],
      },
      fileSystemSnapshot: {
        modifiedFiles: this.recoveryManager.getFileSystemChanges(),
        createdFiles: [],
        deletedFiles: [],
      },
      context: {
        cwd: process.cwd(),
        model: ((context as Record<string, unknown>).model as string) || 'unknown',
        config: ((context as Record<string, unknown>).config as Record<string, unknown>) || {},
      },
      recoveryMetadata: {
        canResume: true,
        interruptionType: undefined,
      },
    };
  }

  /**
   * 从消息中提取已完成的工具
   */
  private extractCompletedTools(messages: Message[]): string[] {
    const tools = new Set<string>();

    for (const msg of messages) {
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.name) {
            tools.add(tc.name);
          }
        }
      }
    }

    return Array.from(tools);
  }

  /**
   * 手动创建检查点
   */
  async createCheckpoint(): Promise<string> {
    const state = this.captureCurrentState();
    return await this.recoveryManager.createCheckpoint(state);
  }

  /**
   * 从检查点恢复
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = await this.recoveryManager.restoreFromCheckpoint(checkpointId);

    // 恢复消息历史
    const messages: Message[] = checkpoint.messages.map((msg) => {
      const message: Message = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        message.toolCalls = msg.toolCalls.map((tc) => ({
          id: `restored-${Date.now()}-${Math.random().toString(36).substring(2)}`,
          name: tc.name,
          args: tc.args,
        }));
      }

      if (msg.toolResults && msg.toolResults.length > 0) {
        message.toolResults = msg.toolResults.map((tr) => ({
          tool: 'unknown',
          input: {},
          output: tr.output,
          isError: tr.isError,
        }));
      }

      return message;
    });

    this.agent.loadMessages(messages);
    this.sessionId = checkpoint.sessionId;
    this.currentTurnIndex = checkpoint.turnIndex;

    console.log(`[Recovery] Restored session ${checkpoint.sessionId} at turn ${checkpoint.turnIndex}`);
  }

  /**
   * 列出可恢复的检查点
   */
  async listRecoverableCheckpoints(): Promise<Checkpoint[]> {
    return await this.recoveryManager.detectUnfinishedSessions();
  }

  /**
   * 增加回合计数
   */
  incrementTurn(): void {
    this.currentTurnIndex++;
  }

  /**
   * 标记工具执行
   */
  trackToolExecution(_toolName: string, filePath?: string): void {
    if (filePath) {
      this.recoveryManager.trackFileChange(filePath);
    }
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取当前会话 ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}
