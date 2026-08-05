/**
 * ConversationManager - 对话管理器
 *
 * 职责：
 * - 管理对话历史 (history)
 * - 管理检查点 (checkpoints)
 * - 构建和管理消息列表
 */

import type { LLMMessage } from '../LLMClient.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ConversationManager {
  // ── 对话历史 ──
  private history: LLMMessage[] = [];

  // ── 检查点系统 ──
  private checkpoints: LLMMessage[][] = [];
  private readonly maxCheckpoints: number;

  constructor(maxCheckpoints: number = 10) {
    this.maxCheckpoints = maxCheckpoints;
  }

  // ── 历史管理 ──

  /**
   * 获取对话历史
   */
  getHistory(): LLMMessage[] {
    return this.history;
  }

  /**
   * 设置对话历史
   */
  setHistory(history: LLMMessage[]): void {
    this.history = history;
  }

  /**
   * 添加消息到历史
   */
  addMessage(message: LLMMessage): void {
    this.history.push(message);
  }

  /**
   * 添加多条消息到历史
   */
  addMessages(messages: LLMMessage[]): void {
    this.history.push(...messages);
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 获取历史长度
   */
  getHistoryLength(): number {
    return this.history.length;
  }

  /**
   * 从历史中移除最后 N 条消息
   */
  removeLastMessages(count: number): void {
    if (count > 0) {
      this.history.splice(-count);
    }
  }

  // ── 检查点管理 ──

  /**
   * 保存当前历史为检查点
   */
  saveCheckpoint(): void {
    // 深拷贝当前历史
    const checkpoint = JSON.parse(JSON.stringify(this.history));
    this.checkpoints.push(checkpoint);

    // 限制检查点数量
    if (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints.shift();
    }
  }

  /**
   * 恢复到指定检查点
   */
  restoreCheckpoint(index: number): void {
    if (index < 0 || index >= this.checkpoints.length) {
      throw new Error(`Invalid checkpoint index: ${index}`);
    }

    // 深拷贝检查点
    this.history = JSON.parse(JSON.stringify(this.checkpoints[index])) || [];
  }

  /**
   * 获取检查点数量
   */
  getCheckpointCount(): number {
    return this.checkpoints.length;
  }

  /**
   * 列出所有检查点（返回索引和大小）
   */
  listCheckpoints(): Array<{ index: number; messageCount: number }> {
    return this.checkpoints.map((cp, index) => ({
      index,
      messageCount: cp.length,
    }));
  }

  /**
   * 清空所有检查点
   */
  clearCheckpoints(): void {
    this.checkpoints = [];
  }

  /**
   * 删除指定检查点
   */
  deleteCheckpoint(index: number): void {
    if (index < 0 || index >= this.checkpoints.length) {
      throw new Error(`Invalid checkpoint index: ${index}`);
    }
    this.checkpoints.splice(index, 1);
  }

  // ── 实用方法 ──

  /**
   * 统计历史中的用户消息数量
   */
  countUserMessages(): number {
    return this.history.filter((msg) => msg.role === 'user').length;
  }

  /**
   * 统计历史中的助手消息数量
   */
  countAssistantMessages(): number {
    return this.history.filter((msg) => msg.role === 'assistant').length;
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage(): LLMMessage | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * 获取最后一条用户消息
   */
  getLastUserMessage(): LLMMessage | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === 'user') {
        return this.history[i];
      }
    }
    return undefined;
  }

  /**
   * 检查历史是否为空
   */
  isEmpty(): boolean {
    return this.history.length === 0;
  }

  // ── 重置所有状态 ──

  resetAll(): void {
    this.clearHistory();
    this.clearCheckpoints();
  }
}
