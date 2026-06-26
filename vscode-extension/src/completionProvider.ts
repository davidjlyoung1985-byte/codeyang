/**
 * Inline Completion Provider for CodeYang - Enhanced Version
 *
 * Features:
 * - Multi-line completions (functions, classes, blocks)
 * - Smart context analysis
 * - Completion statistics tracking
 * - Adaptive caching
 */

import * as vscode from 'vscode';
import { CodeYangClient } from './client';

interface CompletionStats {
  requested: number;
  accepted: number;
  rejected: number;
  avgLength: number;
}

interface CompletionContext {
  isMultiLine: boolean;
  intent: 'function' | 'class' | 'statement' | 'comment' | 'unknown';
  indentation: string;
}

export class CodeYangCompletionProvider implements vscode.InlineCompletionItemProvider {
  private lastTriggerTime = 0;
  private completionDelay: number;
  private cache = new Map<string, string>();
  private stats: CompletionStats = {
    requested: 0,
    accepted: 0,
    rejected: 0,
    avgLength: 0,
  };

  constructor(private client: CodeYangClient) {
    const config = vscode.workspace.getConfiguration('codeyang');
    this.completionDelay = config.get<number>('completionDelay') || 300;

    // Track completion acceptance
    vscode.window.onDidChangeTextEditorSelection((e) => {
      this.trackCompletionAcceptance(e);
    });
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

      // Analyze completion context
      const completionContext = this.analyzeContext(document, position, prefix);

      // Get surrounding context (adaptive based on intent)
      const contextLines = completionContext.isMultiLine ? 100 : 50;
      const startLine = Math.max(0, position.line - contextLines);
      const endLine = Math.min(document.lineCount - 1, position.line + 20);
      const contextRange = new vscode.Range(startLine, 0, endLine, 0);
      const contextText = document.getText(contextRange);

      // Check cache
      const cacheKey = this.getCacheKey(document, position, prefix, completionContext);
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        return [this.createCompletionItem(cached, position, completionContext)];
      }

      // Request completion from CodeYang
      this.stats.requested++;
      const completion = await this.client.getCompletion(
        {
          fileName: document.fileName,
          language: document.languageId,
          prefix,
          suffix: lineText.substring(position.character),
          context: contextText,
          cursorLine: position.line,
          intent: completionContext.intent,
          isMultiLine: completionContext.isMultiLine,
        },
        token,
      );

      if (!completion || token.isCancellationRequested) {
        return undefined;
      }

      // Post-process completion
      const processedCompletion = this.postProcessCompletion(completion, completionContext);

      // Cache result
      this.cache.set(cacheKey, processedCompletion);
      this.manageCacheSize();

      // Update stats
      this.stats.avgLength =
        (this.stats.avgLength * (this.stats.requested - 1) + processedCompletion.length) / this.stats.requested;

      return [this.createCompletionItem(processedCompletion, position, completionContext)];
    } catch (error) {
      console.error('CodeYang completion error:', error);
      return undefined;
    }
  }

  /**
   * Analyze code context to determine completion intent
   */
  private analyzeContext(document: vscode.TextDocument, position: vscode.Position, prefix: string): CompletionContext {
    const line = document.lineAt(position.line).text;
    const indentation = line.match(/^\s*/)?.[0] || '';

    // Detect function/method definition
    const isFunctionStart =
      /^\s*(export\s+)?(async\s+)?function\s+\w+\s*\(/.test(prefix) ||
      /^\s*(public|private|protected)?\s*(async\s+)?\w+\s*\(/.test(prefix) ||
      /^\s*const\s+\w+\s*=\s*\(/.test(prefix);

    // Detect class definition
    const isClassStart = /^\s*(export\s+)?class\s+\w+/.test(prefix);

    // Detect comment
    const isComment = /^\s*(\/\/|\/\*|\*)/.test(prefix);

    // Detect control flow
    const isControlFlow = /^\s*(if|for|while|switch|try)\s*\(/.test(prefix);

    let intent: CompletionContext['intent'] = 'unknown';
    let isMultiLine = false;

    if (isFunctionStart) {
      intent = 'function';
      isMultiLine = true;
    } else if (isClassStart) {
      intent = 'class';
      isMultiLine = true;
    } else if (isComment) {
      intent = 'comment';
      isMultiLine = false;
    } else if (isControlFlow) {
      intent = 'statement';
      isMultiLine = true;
    } else {
      intent = 'statement';
      isMultiLine = false;
    }

    // Check if next line is empty (indication of multi-line intent)
    if (position.line + 1 < document.lineCount) {
      const nextLine = document.lineAt(position.line + 1).text.trim();
      if (!nextLine && !isComment) {
        isMultiLine = true;
      }
    }

    return { isMultiLine, intent, indentation };
  }

  /**
   * Post-process completion based on context
   */
  private postProcessCompletion(completion: string, context: CompletionContext): string {
    let processed = completion;

    // Ensure proper indentation for multi-line completions
    if (context.isMultiLine && processed.includes('\n')) {
      const lines = processed.split('\n');
      processed = lines
        .map((line, index) => {
          if (index === 0) return line;
          // Add base indentation to subsequent lines
          return context.indentation + line;
        })
        .join('\n');
    }

    // Limit single-line completions
    if (!context.isMultiLine && processed.includes('\n')) {
      processed = processed.split('\n')[0];
    }

    // Remove trailing whitespace
    processed = processed.replace(/[ \t]+$/gm, '');

    return processed;
  }

  /**
   * Create completion item with proper range
   */
  private createCompletionItem(
    completion: string,
    position: vscode.Position,
    context: CompletionContext,
  ): vscode.InlineCompletionItem {
    // For multi-line completions, extend range to include subsequent lines
    let range = new vscode.Range(position, position);

    if (context.isMultiLine) {
      const lines = completion.split('\n');
      const endLine = position.line + lines.length - 1;
      const endChar = lines[lines.length - 1].length;
      range = new vscode.Range(position, new vscode.Position(endLine, endChar));
    }

    const item = new vscode.InlineCompletionItem(completion, range);

    // Add command to track acceptance
    item.command = {
      command: 'codeyang.trackAcceptance',
      title: 'Track Completion Acceptance',
      arguments: [completion.length],
    };

    return item;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(
    document: vscode.TextDocument,
    position: vscode.Position,
    prefix: string,
    context: CompletionContext,
  ): string {
    return `${document.fileName}:${position.line}:${prefix}:${context.intent}:${context.isMultiLine}`;
  }

  /**
   * Manage cache size with LRU eviction
   */
  private manageCacheSize() {
    const maxSize = 100;
    if (this.cache.size > maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.cache.size - maxSize);
      keysToDelete.forEach((key) => this.cache.delete(key));
    }
  }

  /**
   * Track completion acceptance/rejection
   */
  private trackCompletionAcceptance(event: vscode.TextEditorSelectionChangeEvent) {
    // This is a simplified tracking - in production you'd want more sophisticated logic
    if (event.kind === vscode.TextEditorSelectionChangeKind.Keyboard) {
      // User accepted completion (pressed Tab/Enter)
      this.stats.accepted++;
    }
  }

  /**
   * Get completion statistics
   */
  getStats(): CompletionStats {
    return { ...this.stats };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}
