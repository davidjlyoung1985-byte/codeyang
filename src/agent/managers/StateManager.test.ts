import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from './StateManager.js';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  describe('Token Usage', () => {
    it('should initialize with zero tokens', () => {
      const usage = stateManager.getTokenUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });

    it('should update token usage', () => {
      stateManager.updateTokenUsage(100, 50);
      const usage = stateManager.getTokenUsage();
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
    });

    it('should accumulate token usage', () => {
      stateManager.updateTokenUsage(100, 50);
      stateManager.updateTokenUsage(200, 150);
      const usage = stateManager.getTokenUsage();
      expect(usage.inputTokens).toBe(300);
      expect(usage.outputTokens).toBe(200);
    });

    it('should reset token usage', () => {
      stateManager.updateTokenUsage(100, 50);
      stateManager.resetTokenUsage();
      const usage = stateManager.getTokenUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });
  });

  describe('Repetition Detection', () => {
    it('should detect exact repeat', () => {
      const text = 'This is a long enough text to be checked for repetition';
      expect(stateManager.checkExactRepeat(text, text)).toBe(true);
    });

    it('should not detect repeat for different texts', () => {
      const text1 = 'This is a long enough text to be checked for repetition';
      const text2 = 'This is a different text that should not match';
      expect(stateManager.checkExactRepeat(text1, text2)).toBe(false);
    });

    it('should not check short texts for exact repeat', () => {
      const shortText = 'Short';
      expect(stateManager.checkExactRepeat(shortText, shortText)).toBe(false);
    });

    it('should record assistant text', () => {
      stateManager.recordAssistantText('Text 1');
      stateManager.recordAssistantText('Text 2');
      expect(stateManager.checkFuzzyRepeat('Text 1')).toBe(false); // Not enough similar texts
    });

    it('should detect fuzzy repeat when multiple similar texts', () => {
      const commonStart = 'This is a common prefix that will be repeated multiple times and it is long enough';
      stateManager.recordAssistantText(commonStart + ' with different ending 1');
      stateManager.recordAssistantText(commonStart + ' with different ending 2');
      stateManager.recordAssistantText(commonStart + ' with different ending 3');

      // The prefix (first 100 chars) should match
      expect(stateManager.checkFuzzyRepeat(commonStart + ' with different ending 4', 80)).toBe(true);
    });

    it('should update repeat count', () => {
      expect(stateManager.getRepeatCount()).toBe(0);
      stateManager.updateRepeatCount(true);
      expect(stateManager.getRepeatCount()).toBe(1);
      stateManager.updateRepeatCount(true);
      expect(stateManager.getRepeatCount()).toBe(2);
      stateManager.updateRepeatCount(false);
      expect(stateManager.getRepeatCount()).toBe(0);
    });

    it('should update and get last assistant text', () => {
      const text = 'Last assistant response';
      stateManager.updateLastAssistantText(text);
      expect(stateManager.getLastAssistantText()).toBe(text);
    });

    it('should reset repetition state', () => {
      stateManager.updateLastAssistantText('Some text');
      stateManager.recordAssistantText('Text 1');
      stateManager.updateRepeatCount(true);

      stateManager.resetRepetition();

      expect(stateManager.getLastAssistantText()).toBe('');
      expect(stateManager.getRepeatCount()).toBe(0);
    });
  });

  describe('Question Management', () => {
    it('should not have pending question initially', () => {
      expect(stateManager.hasPendingQuestion()).toBe(false);
    });

    it('should handle question and answer flow', async () => {
      const questionPromise = stateManager.askQuestion();
      expect(stateManager.hasPendingQuestion()).toBe(true);

      stateManager.answerQuestion('Yes');
      const answer = await questionPromise;

      expect(answer).toBe('Yes');
      expect(stateManager.hasPendingQuestion()).toBe(false);
    });

    it('should handle question cancellation', async () => {
      const questionPromise = stateManager.askQuestion();
      expect(stateManager.hasPendingQuestion()).toBe(true);

      stateManager.cancelQuestion();
      const answer = await questionPromise;

      expect(answer).toBe('[Cancelled by user]');
      expect(stateManager.hasPendingQuestion()).toBe(false);
    });

    it('should not error when answering without pending question', () => {
      expect(() => stateManager.answerQuestion('Yes')).not.toThrow();
    });

    it('should not error when canceling without pending question', () => {
      expect(() => stateManager.cancelQuestion()).not.toThrow();
    });
  });

  describe('Reset All', () => {
    it('should reset all state', async () => {
      // Setup some state
      stateManager.updateTokenUsage(100, 50);
      stateManager.updateLastAssistantText('Some text');
      stateManager.updateRepeatCount(true);
      const questionPromise = stateManager.askQuestion();

      // Reset
      stateManager.resetAll();

      // Verify everything is reset
      const usage = stateManager.getTokenUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(stateManager.getLastAssistantText()).toBe('');
      expect(stateManager.getRepeatCount()).toBe(0);
      expect(stateManager.hasPendingQuestion()).toBe(false);

      // Question should be cancelled
      const answer = await questionPromise;
      expect(answer).toBe('[Cancelled by user]');
    });
  });
});
