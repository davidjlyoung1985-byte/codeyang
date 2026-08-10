/**
 * Agent.run() Refactored Helper Methods
 *
 * This file contains the extracted helper methods for Agent.run()
 * Each method has a single responsibility and is easier to test
 */

import type { LLMMessage } from './LLMClient.js';
import { logger } from '../utils/logger.js';

/**
 * Setup data needed at the start of run()
 */
export interface RunSetupData {
  traceId: string;
  messages: LLMMessage[];
  abortController: AbortController;
}

/**
 * Result from executing a single turn
 */
export interface TurnResult {
  shouldBreak: boolean;
  planProgress?: string;
}

/**
 * Stream result from LLM call
 */
export interface StreamResult {
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  assistantText: string;
}

/**
 * Check if prompt is complex (needs planning guidance)
 */
export function isComplexPrompt(prompt: string): boolean {
  return prompt.length > 200 || (prompt.match(/[。；;.!?？]/g) || []).length >= 2 || prompt.includes('\n');
}

/**
 * Format complex prompt with planning guidance
 */
export function formatComplexPrompt(prompt: string): string {
  return `Task: ${prompt}\n\nFirst: briefly outline your approach (what you'll do step by step).\nThen: execute.`;
}

/**
 * Validate that messages array is not empty
 */
export function validateMessages(messages: LLMMessage[], context: string): void {
  if (messages.length === 0) {
    logger.error(`[${context}] messages is empty!`);
    throw new Error(`Internal error: messages array is empty (${context})`);
  }
}

/**
 * Check for exact text repetition
 */
export function checkExactRepeat(
  currentText: string,
  lastText: string,
  repeatCount: number,
  threshold: number,
): { isRepeat: boolean } {
  if (currentText === lastText) {
    return { isRepeat: repeatCount >= threshold };
  }
  return { isRepeat: false };
}

/**
 * Constants
 */
export const STREAM_TIMEOUT_MS = 300000; // 5 minutes
export const SIMILARITY_PREFIX_LEN = 100;
