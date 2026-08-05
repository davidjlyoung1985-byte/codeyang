/**
 * ConversationManager 单元测试
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ConversationManager } from './ConversationManager.js';
import type { LLMMessage } from '../LLMClient.js';

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  // ── 历史管理 ──

  describe('History Management', () => {
    test('should start with empty history', () => {
      expect(manager.getHistory()).toEqual([]);
      expect(manager.getHistoryLength()).toBe(0);
      expect(manager.isEmpty()).toBe(true);
    });

    test('should add single message to history', () => {
      const msg: LLMMessage = { role: 'user', content: 'Hello' };
      manager.addMessage(msg);

      expect(manager.getHistoryLength()).toBe(1);
      expect(manager.getHistory()[0]).toEqual(msg);
      expect(manager.isEmpty()).toBe(false);
    });

    test('should add multiple messages to history', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ];
      manager.addMessages(messages);

      expect(manager.getHistoryLength()).toBe(3);
      expect(manager.getHistory()).toEqual(messages);
    });

    test('should set history directly', () => {
      const newHistory: LLMMessage[] = [
        { role: 'user', content: 'Test 1' },
        { role: 'assistant', content: 'Test 2' },
      ];
      manager.setHistory(newHistory);

      expect(manager.getHistory()).toEqual(newHistory);
      expect(manager.getHistoryLength()).toBe(2);
    });

    test('should clear history', () => {
      manager.addMessage({ role: 'user', content: 'Hello' });
      expect(manager.getHistoryLength()).toBe(1);

      manager.clearHistory();
      expect(manager.getHistoryLength()).toBe(0);
      expect(manager.isEmpty()).toBe(true);
    });

    test('should remove last N messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
        { role: 'assistant', content: '4' },
      ];
      manager.addMessages(messages);

      manager.removeLastMessages(2);
      expect(manager.getHistoryLength()).toBe(2);
      expect(manager.getHistory()[1].content).toBe('2');
    });

    test('should handle removing zero messages', () => {
      manager.addMessage({ role: 'user', content: 'Hello' });
      manager.removeLastMessages(0);
      expect(manager.getHistoryLength()).toBe(1);
    });
  });

  // ── 检查点管理 ──

  describe('Checkpoint Management', () => {
    test('should start with no checkpoints', () => {
      expect(manager.getCheckpointCount()).toBe(0);
    });

    test('should save checkpoint', () => {
      manager.addMessage({ role: 'user', content: 'Before checkpoint' });
      manager.saveCheckpoint();

      expect(manager.getCheckpointCount()).toBe(1);
    });

    test('should restore checkpoint', () => {
      manager.addMessage({ role: 'user', content: 'Message 1' });
      manager.saveCheckpoint();

      manager.addMessage({ role: 'user', content: 'Message 2' });
      expect(manager.getHistoryLength()).toBe(2);

      manager.restoreCheckpoint(0);
      expect(manager.getHistoryLength()).toBe(1);
      expect(manager.getHistory()[0].content).toBe('Message 1');
    });

    test('should maintain multiple checkpoints', () => {
      manager.addMessage({ role: 'user', content: 'A' });
      manager.saveCheckpoint();

      manager.addMessage({ role: 'user', content: 'B' });
      manager.saveCheckpoint();

      manager.addMessage({ role: 'user', content: 'C' });
      manager.saveCheckpoint();

      expect(manager.getCheckpointCount()).toBe(3);

      manager.restoreCheckpoint(1);
      expect(manager.getHistoryLength()).toBe(2);
    });

    test('should limit checkpoints to max', () => {
      const smallManager = new ConversationManager(3);

      for (let i = 0; i < 5; i++) {
        smallManager.addMessage({ role: 'user', content: `Message ${i}` });
        smallManager.saveCheckpoint();
      }

      expect(smallManager.getCheckpointCount()).toBe(3);
    });

    test('should throw error for invalid checkpoint index', () => {
      manager.saveCheckpoint();
      expect(() => manager.restoreCheckpoint(-1)).toThrow('Invalid checkpoint index');
      expect(() => manager.restoreCheckpoint(10)).toThrow('Invalid checkpoint index');
    });

    test('should list checkpoints', () => {
      manager.addMessage({ role: 'user', content: 'A' });
      manager.saveCheckpoint();

      manager.addMessage({ role: 'user', content: 'B' });
      manager.saveCheckpoint();

      const list = manager.listCheckpoints();
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({ index: 0, messageCount: 1 });
      expect(list[1]).toEqual({ index: 1, messageCount: 2 });
    });

    test('should clear all checkpoints', () => {
      manager.saveCheckpoint();
      manager.saveCheckpoint();
      expect(manager.getCheckpointCount()).toBe(2);

      manager.clearCheckpoints();
      expect(manager.getCheckpointCount()).toBe(0);
    });

    test('should delete specific checkpoint', () => {
      manager.addMessage({ role: 'user', content: 'A' });
      manager.saveCheckpoint();
      manager.addMessage({ role: 'user', content: 'B' });
      manager.saveCheckpoint();
      manager.addMessage({ role: 'user', content: 'C' });
      manager.saveCheckpoint();

      manager.deleteCheckpoint(1);
      expect(manager.getCheckpointCount()).toBe(2);
    });

    test('should throw error when deleting invalid checkpoint', () => {
      expect(() => manager.deleteCheckpoint(0)).toThrow('Invalid checkpoint index');
    });

    test('should deep copy checkpoints', () => {
      const original: LLMMessage = { role: 'user', content: 'Original' };
      manager.addMessage(original);
      manager.saveCheckpoint();

      // Modify original history
      manager.getHistory()[0].content = 'Modified';

      // Restore checkpoint
      manager.restoreCheckpoint(0);
      expect(manager.getHistory()[0].content).toBe('Original');
    });
  });

  // ── 实用方法 ──

  describe('Utility Methods', () => {
    test('should count user messages', () => {
      manager.addMessages([
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
        { role: 'assistant', content: '4' },
        { role: 'user', content: '5' },
      ]);

      expect(manager.countUserMessages()).toBe(3);
    });

    test('should count assistant messages', () => {
      manager.addMessages([
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
        { role: 'assistant', content: '4' },
      ]);

      expect(manager.countAssistantMessages()).toBe(2);
    });

    test('should get last message', () => {
      manager.addMessages([
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Last' },
      ]);

      const last = manager.getLastMessage();
      expect(last).toBeDefined();
      expect(last?.content).toBe('Last');
    });

    test('should return undefined for last message when empty', () => {
      expect(manager.getLastMessage()).toBeUndefined();
    });

    test('should get last user message', () => {
      manager.addMessages([
        { role: 'user', content: 'User 1' },
        { role: 'assistant', content: 'Assistant' },
        { role: 'user', content: 'User 2' },
        { role: 'assistant', content: 'Assistant 2' },
      ]);

      const lastUser = manager.getLastUserMessage();
      expect(lastUser).toBeDefined();
      expect(lastUser?.content).toBe('User 2');
    });

    test('should return undefined for last user message when none exist', () => {
      manager.addMessage({ role: 'assistant', content: 'Only assistant' });
      expect(manager.getLastUserMessage()).toBeUndefined();
    });

    test('should check if empty', () => {
      expect(manager.isEmpty()).toBe(true);
      manager.addMessage({ role: 'user', content: 'Hello' });
      expect(manager.isEmpty()).toBe(false);
    });
  });

  // ── 重置 ──

  describe('Reset', () => {
    test('should reset all state', () => {
      manager.addMessages([
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
      ]);
      manager.saveCheckpoint();
      manager.saveCheckpoint();

      manager.resetAll();

      expect(manager.getHistoryLength()).toBe(0);
      expect(manager.getCheckpointCount()).toBe(0);
      expect(manager.isEmpty()).toBe(true);
    });
  });
});
