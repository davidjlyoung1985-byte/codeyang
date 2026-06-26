/**
 * Semantic Memory Classifier
 *
 * Uses embeddings to classify memories into categories based on semantic similarity.
 * Replaces regex-based classification with vector-based semantic understanding.
 */

import { getEmbeddingService, cosineSimilarity } from './EmbeddingService.js';
import type { Memory } from '../utils/memoryStore.js';

// Memory type examples for few-shot classification
const TYPE_EXAMPLES: Record<Memory['type'], string[]> = {
  instruction: [
    'Always use TypeScript for new projects',
    'Never commit directly to main branch',
    'Prefer functional programming over OOP',
    'Use async/await instead of callbacks',
    'Follow semantic versioning for releases',
  ],
  preference: [
    'I like using Tailwind CSS for styling',
    'My favorite code editor is VS Code',
    'I prefer tabs over spaces',
    'Dark mode is my preferred theme',
    'I want error messages in English',
  ],
  fact: [
    'The project uses Node.js version 18',
    'Database is PostgreSQL 15',
    'API key is stored in .env file',
    'Main branch is called master',
    'Project started on 2024-01-01',
  ],
  project: [
    'The project name is CodeYang AI Agent',
    'Project repository is on GitHub',
    'The project targets Node.js runtime',
    'Build system uses tsup for bundling',
    'The project has VS Code extension support',
  ],
  context: [
    'Working on authentication module',
    'Currently refactoring payment service',
    'Bug fix in progress for login issue',
    'Sprint deadline is next Friday',
    'Team meeting scheduled for tomorrow',
  ],
};

export interface ClassificationResult {
  type: Memory['type'];
  confidence: number;
  scores: Record<Memory['type'], number>;
}

/**
 * Semantic Memory Classifier using embeddings
 */
export class SemanticClassifier {
  private embeddingService = getEmbeddingService();
  private typeEmbeddings: Map<Memory['type'], number[][]> = new Map();
  private initialized = false;

  /**
   * Initialize classifier by computing embeddings for type examples
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[SemanticClassifier] Initializing with example embeddings...');

    for (const [type, examples] of Object.entries(TYPE_EXAMPLES)) {
      const embeddings: number[][] = [];

      for (const example of examples) {
        try {
          const result = await this.embeddingService.embed(example);
          embeddings.push(result.vector);
        } catch (err) {
          console.warn(`[SemanticClassifier] Failed to embed example for ${type}:`, err);
        }
      }

      this.typeEmbeddings.set(type as Memory['type'], embeddings);
    }

    this.initialized = true;
    console.log('[SemanticClassifier] Initialized with embeddings for', this.typeEmbeddings.size, 'types');
  }

  /**
   * Classify memory content using semantic similarity
   */
  async classify(key: string, value: string): Promise<ClassificationResult> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Combine key and value for classification
    const text = `${key}: ${value}`;

    try {
      // Get embedding for the memory content
      const contentEmbedding = await this.embeddingService.embed(text);

      // Calculate similarity scores for each type
      const scores: Record<string, number> = {};

      for (const [type, exampleEmbeddings] of this.typeEmbeddings.entries()) {
        // Calculate average similarity to all examples of this type
        let totalSimilarity = 0;
        let count = 0;

        for (const exampleVector of exampleEmbeddings) {
          const similarity = cosineSimilarity(contentEmbedding.vector, exampleVector);
          totalSimilarity += similarity;
          count++;
        }

        scores[type] = count > 0 ? totalSimilarity / count : 0;
      }

      // Find type with highest score
      let bestType: Memory['type'] = 'fact';
      let bestScore = -1;

      for (const [type, score] of Object.entries(scores)) {
        if (score > bestScore) {
          bestScore = score;
          bestType = type as Memory['type'];
        }
      }

      // Calculate confidence (normalized score)
      const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
      const confidence = totalScore > 0 ? bestScore / totalScore : 0;

      return {
        type: bestType,
        confidence,
        scores: scores as Record<Memory['type'], number>,
      };
    } catch (err) {
      // Fallback to regex-based classification
      console.warn('[SemanticClassifier] Embedding failed, using fallback:', err);
      return this.fallbackClassify(key, value);
    }
  }

  /**
   * Fallback to regex-based classification (when embeddings unavailable)
   */
  private fallbackClassify(key: string, value: string): ClassificationResult {
    const text = `${key} ${value}`.toLowerCase();

    const scores: Record<string, number> = {
      instruction: 0,
      preference: 0,
      fact: 0,
      context: 0,
    };

    // Instruction patterns
    if (/always|never|must|should|prefer|use\s+\w+\s+for/i.test(text)) scores.instruction += 0.3;
    if (/rule|guideline|convention|policy/i.test(text)) scores.instruction += 0.2;
    if (/how\s+to|way\s+to|approach/i.test(text)) scores.instruction += 0.2;

    // Preference patterns
    if (/i\s+like|i\s+prefer|i\s+want|favorite|preference/i.test(text)) scores.preference += 0.4;
    if (/color|theme|font|style|layout/i.test(text)) scores.preference += 0.2;

    // Fact patterns
    if (/version|database|api|server|port|config/i.test(text)) scores.fact += 0.3;
    if (/is\s+\w+|uses\s+\w+|stored\s+in/i.test(text)) scores.fact += 0.2;

    // Context patterns
    if (/working\s+on|currently|in\s+progress|deadline|meeting/i.test(text)) scores.context += 0.3;
    if (/sprint|ticket|issue|bug|feature/i.test(text)) scores.context += 0.2;

    // Find best type
    let bestType: Memory['type'] = 'fact';
    let bestScore = -1;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as Memory['type'];
      }
    }

    const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
    const confidence = totalScore > 0 ? bestScore / totalScore : 0.25;

    return {
      type: bestType,
      confidence,
      scores: scores as Record<Memory['type'], number>,
    };
  }

  /**
   * Add custom examples for a type
   */
  async addExamples(type: Memory['type'], examples: string[]): Promise<void> {
    const existingEmbeddings = this.typeEmbeddings.get(type) || [];

    for (const example of examples) {
      try {
        const result = await this.embeddingService.embed(example);
        existingEmbeddings.push(result.vector);
      } catch (err) {
        console.warn(`[SemanticClassifier] Failed to add example for ${type}:`, err);
      }
    }

    this.typeEmbeddings.set(type, existingEmbeddings);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      typeCount: this.typeEmbeddings.size,
      examplesPerType: Array.from(this.typeEmbeddings.entries()).map(([type, embeddings]) => ({
        type,
        count: embeddings.length,
      })),
      cacheSize: this.embeddingService.getCacheSize(),
    };
  }
}

// Singleton instance
let semanticClassifier: SemanticClassifier | null = null;

/**
 * Get or create semantic classifier instance
 */
export function getSemanticClassifier(): SemanticClassifier {
  if (!semanticClassifier) {
    semanticClassifier = new SemanticClassifier();
  }
  return semanticClassifier;
}

/**
 * Classify memory using semantic understanding
 */
export async function classifyMemorySemantic(key: string, value: string): Promise<ClassificationResult> {
  const classifier = getSemanticClassifier();
  return classifier.classify(key, value);
}
