/**
 * Inline Completion Provider for CodeYang
 *
 * Provides real-time code suggestions as you type.
 */

import * as vscode from 'vscode';
import { CodeYangClient } from './client';

export class CodeYangCompletionProvider implements vscode.InlineCompletionItemProvider {
  private lastTriggerTime = 0;
  private completionDelay: number;
  private cache = new Map<string, string>();

  constructor(private client: CodeYangClient) {
    const config = vscode.workspace.getConfiguration('codeyang');
    this.completionDelay = config.get<number>('completionDelay') || 300;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    // Debounce: prevent too frequent requests
    const now = Date.now();
    if (now - this.lastTriggerTime < this.completionDelay) {
      return undefined;
    }
    this.lastTriggerTime = now;

    try {
      // Get context: current line + previous lines
      const lineText = document.lineAt(position.line).text;
      const prefix = lineText.substring(0, position.character);

      // Don't trigger on empty lines or just whitespace
      if (!prefix.trim()) {
        return undefined;
      }

      // Get surrounding context (up to 50 lines before, 10 lines after)
      const startLine = Math.max(0, position.line - 50);
      const endLine = Math.min(document.lineCount - 1, position.line + 10);
      const contextRange = new vscode.Range(startLine, 0, endLine, 0);
      const contextText = document.getText(contextRange);

      // Check cache
      const cacheKey = `${document.fileName}:${position.line}:${prefix}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        return [new vscode.InlineCompletionItem(cached)];
      }

      // Request completion from CodeYang
      const completion = await this.client.getCompletion(
        {
          fileName: document.fileName,
          language: document.languageId,
          prefix,
          suffix: lineText.substring(position.character),
          context: contextText,
          cursorLine: position.line,
        },
        token,
      );

      if (!completion || token.isCancellationRequested) {
        return undefined;
      }

      // Cache result
      this.cache.set(cacheKey, completion);

      // Limit cache size
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
    } catch (error) {
      console.error('CodeYang completion error:', error);
      return undefined;
    }
  }
}
