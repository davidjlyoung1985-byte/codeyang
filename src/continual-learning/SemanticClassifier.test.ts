/**
 * Test Semantic Memory Classification
 *
 * Tests the new embedding-based memory classification system
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SemanticClassifier, getSemanticClassifier, classifyMemorySemantic } from './SemanticClassifier.js';
import { getEmbeddingService, resetEmbeddingService } from './EmbeddingService.js';

describe('EmbeddingService', () => {
  beforeEach(() => {
    resetEmbeddingService();
  });

  it('should create singleton instance', () => {
    const service1 = getEmbeddingService();
    const service2 = getEmbeddingService();
    expect(service1).toBe(service2);
  });

  it('should generate pseudo-embeddings as fallback', async () => {
    const service = getEmbeddingService({ provider: 'local' });
    const result = await service.embed('test memory content');

    expect(result.vector).toBeDefined();
    expect(result.vector.length).toBeGreaterThan(0);
    expect(result.dimensions).toBe(384);
    expect(result.model).toBe('pseudo-embedding');
  });

  it('should cache embeddings', async () => {
    const service = getEmbeddingService({ provider: 'local' });
    service.clearCache();

    await service.embed('test content');
    expect(service.getCacheSize()).toBe(1);

    await service.embed('test content'); // Same content
    expect(service.getCacheSize()).toBe(1); // Should use cache

    await service.embed('different content');
    expect(service.getCacheSize()).toBe(2);
  });

  it('should calculate cosine similarity correctly', async () => {
    const service = getEmbeddingService({ provider: 'local' });

    const result1 = await service.embed('Always use TypeScript');
    const result2 = await service.embed('Always use TypeScript'); // Identical
    const result3 = await service.embed('I prefer dark mode'); // Different

    const { cosineSimilarity } = await import('./EmbeddingService.js');

    // Identical vectors should have similarity = 1
    const sim1 = cosineSimilarity(result1.vector, result2.vector);
    expect(sim1).toBeCloseTo(1.0, 5);

    // Different vectors should have similarity < 1
    const sim2 = cosineSimilarity(result1.vector, result3.vector);
    expect(sim2).toBeLessThan(0.9);
  });
});

describe('SemanticClassifier', () => {
  let classifier: SemanticClassifier;

  beforeAll(async () => {
    // Use local provider so tests work without OpenAI API key
    resetEmbeddingService();
    getEmbeddingService({ provider: 'local' });
    classifier = getSemanticClassifier();
    await classifier.initialize();
  });

  it('should initialize with type examples', () => {
    const stats = classifier.getStats();
    expect(stats.initialized).toBe(true);
    expect(stats.typeCount).toBeGreaterThan(0);
  });

  it('should classify instruction memories', async () => {
    const result = await classifier.classify('coding-style', 'Always use async/await instead of callbacks');

    expect(result.type).toBe('instruction');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.scores).toHaveProperty('instruction');
    expect(result.scores).toHaveProperty('preference');
    expect(result.scores).toHaveProperty('fact');
    expect(result.scores).toHaveProperty('context');
  });

  it('should classify preference memories', async () => {
    const result = await classifier.classify('editor', 'I prefer VS Code for development');

    expect(result.type).toBe('preference');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should classify fact memories', async () => {
    const result = await classifier.classify('nodejs-version', 'Project uses Node.js 18.x');

    expect(result.type).toBe('fact');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should classify context memories', async () => {
    const result = await classifier.classify('current-task', 'Currently working on authentication module');

    expect(result.type).toBe('context');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should handle edge cases', async () => {
    // Empty content
    const result1 = await classifier.classify('', '');
    expect(result1.type).toBeDefined();

    // Very short content
    const result2 = await classifier.classify('x', 'y');
    expect(result2.type).toBeDefined();

    // Special characters
    const result3 = await classifier.classify('test@#$%', '!@#$%^&*()');
    expect(result3.type).toBeDefined();
  });

  it('should allow adding custom examples', async () => {
    const statsBefore = classifier.getStats();
    const instructionCountBefore = statsBefore.examplesPerType.find((e) => e.type === 'instruction')?.count || 0;

    await classifier.addExamples('instruction', ['Use strict mode in all JavaScript files']);

    const statsAfter = classifier.getStats();
    const instructionCountAfter = statsAfter.examplesPerType.find((e) => e.type === 'instruction')?.count || 0;

    expect(instructionCountAfter).toBeGreaterThan(instructionCountBefore);
  });

  it('should provide confidence scores for all types', async () => {
    const result = await classifier.classify('test-key', 'test value');

    expect(result.scores.instruction).toBeGreaterThanOrEqual(0);
    expect(result.scores.preference).toBeGreaterThanOrEqual(0);
    expect(result.scores.fact).toBeGreaterThanOrEqual(0);
    expect(result.scores.context).toBeGreaterThanOrEqual(0);

    // Confidence should be between 0 and 1
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe('classifyMemorySemantic helper', () => {
  beforeEach(() => {
    resetEmbeddingService();
    getEmbeddingService({ provider: 'local' });
  });

  it('should classify memories using the global classifier', async () => {
    const result = await classifyMemorySemantic('git-workflow', 'Never commit directly to main branch');

    expect(result.type).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.scores).toBeDefined();
  });
});

describe('Real-world classification scenarios', () => {
  let classifier: SemanticClassifier;

  beforeAll(async () => {
    // Use local provider so tests work without OpenAI API key
    resetEmbeddingService();
    getEmbeddingService({ provider: 'local' });
    classifier = getSemanticClassifier();
    await classifier.initialize();
  });

  it('should correctly classify coding standards', async () => {
    const testCases = [
      { key: 'code-style', value: 'Use 2 spaces for indentation', expected: 'instruction' },
      { key: 'error-handling', value: 'Always use try-catch blocks', expected: 'instruction' },
      { key: 'naming', value: 'Use camelCase for variable names', expected: 'instruction' },
    ];

    for (const { key, value, expected } of testCases) {
      const result = await classifier.classify(key, value);
      expect(result.type).toBe(expected);
    }
  });

  it('should correctly classify user preferences', async () => {
    const testCases = [
      { key: 'theme', value: 'I like dark mode', expected: 'preference' },
      { key: 'language', value: 'I prefer TypeScript over JavaScript', expected: 'preference' },
      { key: 'framework', value: 'My favorite framework is React', expected: 'preference' },
    ];

    for (const { key, value, expected } of testCases) {
      const result = await classifier.classify(key, value);
      expect(result.type).toBe(expected);
    }
  });

  it('should correctly classify technical facts', async () => {
    const testCases = [
      { key: 'database', value: 'Using PostgreSQL 15', expected: 'fact' },
      { key: 'port', value: 'Server runs on port 3000', expected: 'fact' },
      { key: 'version', value: 'Node.js version is 18.17.0', expected: 'fact' },
    ];

    for (const { key, value, expected } of testCases) {
      const result = await classifier.classify(key, value);
      expect(result.type).toBe(expected);
    }
  });

  it('should correctly classify context information', async () => {
    const testCases = [
      { key: 'current-work', value: 'Working on user authentication', expected: 'context' },
      { key: 'sprint', value: 'Sprint 5 in progress', expected: 'context' },
      { key: 'deadline', value: 'Release scheduled for next week', expected: 'context' },
    ];

    for (const { key, value, expected } of testCases) {
      const result = await classifier.classify(key, value);
      expect(result.type).toBe(expected);
    }
  });
});
