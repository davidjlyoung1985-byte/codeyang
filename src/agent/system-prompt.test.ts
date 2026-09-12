import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { buildBaseSystemPrompt, loadKnowledgeBase, BASE_SYSTEM_PROMPT } from './system-prompt.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { codeyangPath } from '../utils/paths.js';

describe('System Prompt', () => {
  describe('BASE_SYSTEM_PROMPT', () => {
    test('should contain core sections', () => {
      expect(BASE_SYSTEM_PROMPT).toContain('You are CodeYang');
      expect(BASE_SYSTEM_PROMPT).toContain('## Speed');
      expect(BASE_SYSTEM_PROMPT).toContain('## Brevity');
      expect(BASE_SYSTEM_PROMPT).toContain('## Accuracy');
    });

    test('should mention key tools', () => {
      expect(BASE_SYSTEM_PROMPT).toContain('Bash');
      expect(BASE_SYSTEM_PROMPT).toContain('WebFetch');
      expect(BASE_SYSTEM_PROMPT).toContain('WebSearch');
    });

    test('should mention task system', () => {
      expect(BASE_SYSTEM_PROMPT).toContain('TaskCreate');
      expect(BASE_SYSTEM_PROMPT).toContain('TaskList');
    });

    test('should mention memory and reflexion', () => {
      expect(BASE_SYSTEM_PROMPT).toContain('Memory');
      expect(BASE_SYSTEM_PROMPT).toContain('Reflexion');
    });
  });

  describe('buildBaseSystemPrompt', () => {
    const testProfilePath = codeyangPath('profile.md');
    const testKnowledgePath = codeyangPath('knowledge');

    beforeEach(() => {
      if (existsSync(testProfilePath)) rmSync(testProfilePath);
      if (existsSync(testKnowledgePath)) rmSync(testKnowledgePath, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testProfilePath)) rmSync(testProfilePath);
      if (existsSync(testKnowledgePath)) rmSync(testKnowledgePath, { recursive: true });
    });

    test('should return base prompt when no profile or knowledge exists', () => {
      const prompt = buildBaseSystemPrompt();
      expect(prompt).toBe(BASE_SYSTEM_PROMPT);
    });

    test('should include profile when profile.md exists', () => {
      writeFileSync(testProfilePath, 'I prefer TypeScript');
      const prompt = buildBaseSystemPrompt();
      expect(prompt).toContain('## User Profile');
      expect(prompt).toContain('I prefer TypeScript');
    });

    test('should include knowledge base', () => {
      mkdirSync(testKnowledgePath, { recursive: true });
      writeFileSync(join(testKnowledgePath, 'api.md'), 'API docs');
      const prompt = buildBaseSystemPrompt();
      expect(prompt).toContain('## Knowledge Base');
      expect(prompt).toContain('[knowledge:api]');
    });
  });

  describe('loadKnowledgeBase', () => {
    const testKnowledgePath = codeyangPath('knowledge');

    beforeEach(() => {
      if (existsSync(testKnowledgePath)) rmSync(testKnowledgePath, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testKnowledgePath)) rmSync(testKnowledgePath, { recursive: true });
    });

    test('should return empty when directory does not exist', () => {
      expect(loadKnowledgeBase()).toBe('');
    });

    test('should load knowledge files', () => {
      mkdirSync(testKnowledgePath, { recursive: true });
      writeFileSync(join(testKnowledgePath, 'test.md'), 'Content');
      const result = loadKnowledgeBase();
      expect(result).toContain('[knowledge:test]');
    });
  });
});
