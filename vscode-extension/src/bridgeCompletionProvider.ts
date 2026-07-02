/**
 * Bridge Completion Provider
 *
 * Uses CodeYang Agent through Bridge for intelligent completion
 * with full tool access, RL optimization, and semantic understanding
 */

import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';

export class BridgeCompletionProvider implements vscode.InlineCompletionItemProvider {
  private completionCount = 0;
  private successCount = 0;

  constructor(private bridgeClient: BridgeClient) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | null> {
    try {
      // Check if Bridge is connected
      if (!this.bridgeClient.isConnected()) {
        console.log('[BridgeCompletion] Bridge not connected, skipping');
        return null;
      }

      this.completionCount++;

      // Get code context
      const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(Math.max(0, position.line - 10), 0), position),
      );

      const textAfterCursor = document.getText(
        new vscode.Range(position, new vscode.Position(Math.min(document.lineCount - 1, position.line + 5), 0)),
      );

      // Get file context
      const filePath = document.uri.fsPath;
      const language = document.languageId;

      // Request completion from Agent through Bridge
      const response = await this.bridgeClient.complete({
        code: textBeforeCursor,
        language,
        filePath,
        cursorPosition: {
          line: position.line,
          character: position.character,
        },
        context: textAfterCursor,
        useTools: true, // Agent can use Read, Grep, etc.
        useRL: true, // Use RL weights for optimal completion
      });

      if (!response.completion || token.isCancellationRequested) {
        return null;
      }

      this.successCount++;

      // Show which tools were used (optional)
      if (response.toolsUsed && response.toolsUsed.length > 0) {
        console.log(`[BridgeCompletion] Tools used: ${response.toolsUsed.join(', ')}`);
      }

      // Create inline completion item
      const completionItem = new vscode.InlineCompletionItem(response.completion, new vscode.Range(position, position));

      return [completionItem];
    } catch (error) {
      console.error('[BridgeCompletion] Error:', error);
      return null;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalRequests: this.completionCount,
      successful: this.successCount,
      successRate: this.completionCount > 0 ? (this.successCount / this.completionCount) * 100 : 0,
    };
  }
}
