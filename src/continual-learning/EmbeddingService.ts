/**
 * Embedding Service - Semantic Understanding for Memory System
 *
 * Provides text embeddings for semantic memory classification and retrieval.
 * Supports multiple embedding providers:
 * - OpenAI (text-embedding-3-small, text-embedding-3-large)
 * - Anthropic Claude (via Voyage AI)
 * - Local models (Sentence Transformers)
 */

import axios from 'axios';

export interface EmbeddingVector {
  vector: number[];
  dimensions: number;
  model: string;
}

export interface EmbeddingOptions {
  provider?: 'openai' | 'voyage' | 'local';
  model?: string;
  dimensions?: number;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Embedding Service
 */
export class EmbeddingService {
  private provider: 'openai' | 'voyage' | 'local';
  private model: string;
  private cache = new Map<string, EmbeddingVector>();

  constructor(options: EmbeddingOptions = {}) {
    this.provider = options.provider || 'openai';

    // Default models
    const defaultModels = {
      openai: 'text-embedding-3-small',
      voyage: 'voyage-2',
      local: 'all-MiniLM-L6-v2',
    };

    this.model = options.model || defaultModels[this.provider];
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string, options: EmbeddingOptions = {}): Promise<EmbeddingVector> {
    // Check cache
    const cacheKey = `${this.provider}:${this.model}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let result: EmbeddingVector;

    switch (this.provider) {
      case 'openai':
        result = await this.embedOpenAI(text, options);
        break;
      case 'voyage':
        result = await this.embedVoyage(text, options);
        break;
      case 'local':
        result = await this.embedLocal(text, options);
        break;
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }

    // Cache result
    this.cache.set(cacheKey, result);

    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    return result;
  }

  /**
   * Embed using OpenAI API
   */
  private async embedOpenAI(text: string, options: EmbeddingOptions): Promise<EmbeddingVector> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.CODEYANG_OPENAI_API_KEY || '';
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const model = options.model || this.model;
    const dimensions = options.dimensions || 1536; // Default for text-embedding-3-small

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model,
          input: text,
          dimensions: model === 'text-embedding-3-small' ? Math.min(dimensions, 1536) : dimensions,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      const vector = response.data.data[0].embedding;

      return {
        vector,
        dimensions: vector.length,
        model,
      };
    } catch (error) {
      throw new Error(`OpenAI embedding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Embed using Voyage AI (recommended for Claude users)
   */
  private async embedVoyage(text: string, options: EmbeddingOptions): Promise<EmbeddingVector> {
    const apiKey = process.env.VOYAGE_API_KEY || process.env.CODEYANG_VOYAGE_API_KEY || '';
    if (!apiKey) {
      throw new Error('Voyage API key not configured');
    }

    const model = options.model || this.model;

    try {
      const response = await axios.post(
        'https://api.voyageai.com/v1/embeddings',
        {
          model,
          input: text,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      const vector = response.data.data[0].embedding;

      return {
        vector,
        dimensions: vector.length,
        model,
      };
    } catch (error) {
      throw new Error(`Voyage embedding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Embed using local model (fallback, requires local server)
   */
  private async embedLocal(text: string, options: EmbeddingOptions): Promise<EmbeddingVector> {
    const localEndpoint = process.env.LOCAL_EMBEDDING_ENDPOINT || 'http://localhost:8080/embed';

    try {
      const response = await axios.post(
        localEndpoint,
        {
          text,
          model: options.model || this.model,
        },
        {
          timeout: 5000,
        },
      );

      const vector = response.data.embedding;

      return {
        vector,
        dimensions: vector.length,
        model: this.model,
      };
    } catch {
      // Fallback: use simple hash-based pseudo-embedding
      console.warn('Local embedding service unavailable, using fallback');
      return this.generatePseudoEmbedding(text);
    }
  }

  /**
   * Generate pseudo-embedding (fallback when no embedding service available)
   */
  private generatePseudoEmbedding(text: string): EmbeddingVector {
    // Simple hash-based embedding (384 dimensions)
    const dimensions = 384;
    const vector = new Array(dimensions).fill(0);

    // Use text features to generate pseudo-embedding
    const words = text.toLowerCase().split(/\s+/);
    const chars = text.split('');

    // Feature 1: Word frequency distribution
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = this.simpleHash(word) % dimensions;
      vector[hash] += 1.0 / words.length;
    }

    // Feature 2: Character n-grams
    for (let i = 0; i < chars.length - 2; i++) {
      const trigram = chars.slice(i, i + 3).join('');
      const hash = this.simpleHash(trigram) % dimensions;
      vector[hash] += 0.5 / (chars.length - 2);
    }

    // Normalize vector
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) {
        vector[i] /= norm;
      }
    }

    return {
      vector,
      dimensions,
      model: 'pseudo-embedding',
    };
  }

  /**
   * Simple string hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Find most similar embeddings from a list
   */
  findMostSimilar(
    queryVector: number[],
    candidateVectors: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>,
    topK = 5,
  ): Array<{ id: string; similarity: number; metadata?: Record<string, unknown> }> {
    const similarities = candidateVectors.map((candidate) => ({
      id: candidate.id,
      similarity: cosineSimilarity(queryVector, candidate.vector),
      metadata: candidate.metadata,
    }));

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, topK);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

/**
 * Get or create embedding service instance
 */
export function getEmbeddingService(options?: EmbeddingOptions): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(options);
  }
  return embeddingService;
}
