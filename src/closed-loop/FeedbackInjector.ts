import type { LLMMessage } from '../agent/LLMClient.js';
import type { VerificationResult } from './VerificationPipeline.js';

export interface FeedbackEntry {
  summary: string;
  source: 'auto-verify' | 'file-watch' | 'post-tool';
  passed: boolean;
  results: VerificationResult[];
}

export class FeedbackInjector {
  private pendingFeedback: FeedbackEntry[] = [];

  push(entry: FeedbackEntry): void {
    this.pendingFeedback.push(entry);
  }

  drain(): FeedbackEntry[] {
    const items = this.pendingFeedback.slice();
    this.pendingFeedback = [];
    return items;
  }

  hasPending(): boolean {
    return this.pendingFeedback.length > 0;
  }

  injectIntoHistory(history: LLMMessage[]): void {
    const items = this.drain();
    if (items.length === 0) return;

    const parts: string[] = [];

    for (const item of items) {
      parts.push(item.summary);
    }

    history.push({
      role: 'user',
      content: parts.join('\n\n'),
    });
  }

  static formatAutoVerify(summary: string): string {
    return summary;
  }
}
