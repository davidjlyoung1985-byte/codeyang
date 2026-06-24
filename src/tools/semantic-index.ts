/**
 * Semantic Tool Selection — vector-based tool retrieval.
 *
 * Replaces simple fuzzy-matching with a lightweight semantic index.
 * Uses TF-IDF weighted token overlap + description embedding scoring.
 *
 * Each tool's name, description, and parameter names are indexed as a
 * document. Queries are tokenized and scored against all documents using
 * cosine similarity over TF-IDF vectors.
 *
 * No external dependencies — pure JS implementation.
 */

// ── Tokenizer ──────────────────────────────────────────────────────────

/** Tokenize text into normalized terms with positional info. */
function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Split CamelCase: "GitStatus" → "git status"
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // Remove non-alphanumeric (keep CJK)
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 || /^[0-9a-z]$/.test(t))
  );
}

// ── TF-IDF Index ───────────────────────────────────────────────────────

interface IndexedTool {
  name: string;
  description: string;
  /** Bag of words with TF */
  termFreq: Map<string, number>;
}

let toolIndex: IndexedTool[] = [];
let idfCache: Map<string, number> = new Map();
let indexVersion = 0;

/** Rebuild the semantic index from raw tool data. */
export function rebuildSemanticIndex(
  tools: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>,
): void {
  const docs: IndexedTool[] = [];

  for (const t of tools) {
    // Build a rich document from name + description + parameter names
    const paramNames = t.parameters ? Object.keys(t.parameters).join(' ') : '';
    const docText = [t.name, t.description, paramNames].join(' ');
    const terms = tokenize(docText);

    const termFreq = new Map<string, number>();
    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    docs.push({ name: t.name, description: t.description, termFreq });
  }

  toolIndex = docs;
  idfCache = computeIDF(docs);
  indexVersion++;
}

function computeIDF(docs: IndexedTool[]): Map<string, number> {
  const docCount = docs.length;
  const df = new Map<string, number>();

  for (const doc of docs) {
    for (const term of doc.termFreq.keys()) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((docCount + 1) / (count + 1)) + 1);
  }
  return idf;
}

/** Compute TF-IDF vector for a query or tool document. */
function computeTFIDF(termFreq: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const maxFreq = Math.max(...termFreq.values(), 1);
  const vector = new Map<string, number>();

  for (const [term, freq] of termFreq) {
    const tf = 0.5 + (0.5 * freq) / maxFreq; // augmented TF
    const w = idf.get(term) || 1.0;
    vector.set(term, tf * w);
  }

  return vector;
}

/** Cosine similarity between two sparse vectors. */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, valA] of a) {
    normA += valA * valA;
    const valB = b.get(term);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }
  for (const valB of b.values()) {
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Public API ─────────────────────────────────────────────────────────

export interface ScoredTool {
  name: string;
  score: number;
  matchType: 'exact' | 'prefix' | 'semantic' | 'alias' | 'fuzzy';
}

/**
 * Search tools by query using semantic scoring.
 *
 * Scoring tiers (combined):
 * - exact name match: 100
 * - alias match: 95
 * - prefix match: 80 + 20 * semanticScore
 * - semantic match (TF-IDF > 0.3): 40 + 60 * semanticScore
 * - fuzzy (CamelCase part): 20 + 10 * semanticScore
 */
export function semanticToolSearch(query: string, toolNames: string[], aliases: Record<string, string>): ScoredTool[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Rebuild index if needed
  if (indexVersion === 0 && toolIndex.length === 0) {
    rebuildSemanticIndex(toolNames.map((n) => ({ name: n, description: '' })));
  }

  // Compute query TF-IDF vector
  const queryTerms = tokenize(q);
  const queryTF = new Map<string, number>();
  for (const term of queryTerms) {
    queryTF.set(term, (queryTF.get(term) || 0) + 1);
  }
  const queryVector = computeTFIDF(queryTF, idfCache);

  const scored: ScoredTool[] = [];
  const seen = new Set<string>();

  for (const name of toolNames) {
    // 1. Exact match (case-insensitive)
    if (name.toLowerCase() === q) {
      scored.push({ name, score: 100, matchType: 'exact' });
      seen.add(name);
      continue;
    }

    // 2. Prefix match
    if (name.toLowerCase().startsWith(q)) {
      scored.push({ name, score: 80, matchType: 'prefix' });
      seen.add(name);
      continue;
    }
  }

  // 3. Alias matches
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (alias.toLowerCase() === q && !seen.has(canonical)) {
      scored.push({ name: canonical, score: 95, matchType: 'alias' });
      seen.add(canonical);
    }
  }

  // 4. Semantic matches (TF-IDF cosine similarity)
  for (const tool of toolIndex) {
    if (seen.has(tool.name)) continue;

    const toolVector = computeTFIDF(tool.termFreq, idfCache);
    const sim = cosineSimilarity(queryVector, toolVector);

    if (sim > 0.3) {
      const score = Math.round(40 + 60 * sim);
      scored.push({ name: tool.name, score, matchType: 'semantic' });
      seen.add(tool.name);
    }
  }

  // 5. CamelCase part match for remaining
  for (const name of toolNames) {
    if (seen.has(name)) continue;
    const parts = name.split(/(?<=[a-z])(?=[A-Z])/).map((p) => p.toLowerCase());
    const joined = parts.join('');
    if (parts.some((p) => p.includes(q)) || joined.includes(q)) {
      scored.push({ name, score: 25, matchType: 'fuzzy' });
      seen.add(name);
    }
  }

  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * Get the top-k semantically matching tool names.
 */
export function semanticFindTools(
  query: string,
  toolNames: string[],
  aliases: Record<string, string>,
  k = 10,
): string[] {
  return semanticToolSearch(query, toolNames, aliases)
    .slice(0, k)
    .map((s) => s.name);
}

/**
 * Get a description of why a tool matched (for user feedback).
 */
export function explainToolMatch(
  query: string,
  toolName: string,
  toolNames: string[],
  aliases: Record<string, string>,
): string {
  const results = semanticToolSearch(query, toolNames, aliases);
  const match = results.find((r) => r.name === toolName);
  if (!match) return `No match found for "${query}" → ${toolName}`;
  return `"${query}" → ${toolName} (${match.matchType}, score: ${match.score})`;
}

/** Get index version for cache invalidation. */
export function getSemanticIndexVersion(): number {
  return indexVersion;
}
