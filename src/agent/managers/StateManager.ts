/**
 * StateManager - 状态管理器
 *
 * 职责：
 * - Token 使用追踪
 * - 重复检测（防止 Agent 陷入循环）
 * - 问答状态管理
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export class StateManager {
  // ── Token 使用追踪 ──
  private tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  // ── 反重复检测 ──
  private lastAssistantText = '';
  private recentAssistantTexts: string[] = [];
  private repeatCount = 0;
  private readonly maxRecentTexts = 4;

  // ── 问答状态 ──
  private questionResolve: ((answer: string) => void) | null = null;

  // ── Token 管理 ──

  updateTokenUsage(inputTokens: number, outputTokens: number): void {
    this.tokenUsage.inputTokens += inputTokens;
    this.tokenUsage.outputTokens += outputTokens;
  }

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  resetTokenUsage(): void {
    this.tokenUsage = { inputTokens: 0, outputTokens: 0 };
  }

  // ── 重复检测 ──

  /**
   * 记录 Assistant 的输出文本，用于重复检测
   */
  recordAssistantText(text: string): void {
    this.recentAssistantTexts.push(text);
    if (this.recentAssistantTexts.length > this.maxRecentTexts) {
      this.recentAssistantTexts.shift();
    }
  }

  /**
   * 检查是否精确重复
   */
  checkExactRepeat(currentText: string, previousText: string): boolean {
    if (!currentText || !previousText) return false;
    if (currentText.length < 50) return false; // 太短的文本不检查
    return currentText.trim() === previousText.trim();
  }

  /**
   * 检查是否模糊重复（前缀相似）
   */
  checkFuzzyRepeat(currentText: string, similarityPrefixLen: number = 100): boolean {
    if (this.recentAssistantTexts.length < 2) return false;

    const prefix = currentText.slice(0, similarityPrefixLen).trim();
    if (prefix.length < 50) return false;

    let matchCount = 0;
    for (const prevText of this.recentAssistantTexts) {
      const prevPrefix = prevText.slice(0, similarityPrefixLen).trim();
      if (prefix === prevPrefix) {
        matchCount++;
        if (matchCount >= 2) return true; // 提前返回
      }
    }

    return false;
  }

  /**
   * 更新重复计数
   */
  updateRepeatCount(isRepeat: boolean): void {
    if (isRepeat) {
      this.repeatCount++;
    } else {
      this.repeatCount = 0;
    }
  }

  /**
   * 获取重复计数
   */
  getRepeatCount(): number {
    return this.repeatCount;
  }

  /**
   * 更新最后的 Assistant 文本
   */
  updateLastAssistantText(text: string): void {
    this.lastAssistantText = text;
  }

  /**
   * 获取最后的 Assistant 文本
   */
  getLastAssistantText(): string {
    return this.lastAssistantText;
  }

  /**
   * 重置重复检测状态
   */
  resetRepetition(): void {
    this.lastAssistantText = '';
    this.recentAssistantTexts = [];
    this.repeatCount = 0;
  }

  // ── 问答管理 ──

  /**
   * 询问问题（返回 Promise，等待用户回答）
   */
  askQuestion(): Promise<string> {
    return new Promise((resolve) => {
      this.questionResolve = resolve;
    });
  }

  /**
   * 回答问题
   */
  answerQuestion(answer: string): void {
    if (this.questionResolve) {
      this.questionResolve(answer);
      this.questionResolve = null;
    }
  }

  /**
   * 取消问题（用户取消或超时）
   */
  cancelQuestion(): void {
    if (this.questionResolve) {
      this.questionResolve('[Cancelled by user]');
      this.questionResolve = null;
    }
  }

  /**
   * 检查是否有待回答的问题
   */
  hasPendingQuestion(): boolean {
    return this.questionResolve !== null;
  }

  // ── 重置所有状态 ──

  resetAll(): void {
    this.resetTokenUsage();
    this.resetRepetition();
    this.cancelQuestion();
  }
}
