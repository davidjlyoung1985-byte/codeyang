/**
 * Tool name aliases and semantic search support.
 *
 * Aliases map common shorthand names (like `ls`, `cp`, `sh`) to canonical
 * PascalCase tool names (like `List`, `Copy`, `Bash`).
 *
 * fuzzyFindTools delegates to semantic-index.ts for TF-IDF based retrieval,
 * which is more accurate than simple prefix/substring matching.
 */

import { semanticFindTools, getSemanticIndexVersion } from './semantic-index.js';

export const TOOL_ALIASES: Record<string, string> = {
  // Core
  sh: 'Bash',
  shell: 'Bash',
  cat: 'Read',
  echo: 'Write',
  sed: 'Edit',
  find: 'Glob',
  rg: 'Grep',
  grep: 'Grep',
  todo: 'TodoWrite',
  stats: 'TodoWrite',
  todos: 'TodoWrite',
  fetch: 'WebFetch',
  curl: 'WebFetch',
  wget: 'WebFetch',
  ask: 'Question',
  help: 'Question',
  launch: 'LaunchApp',
  open: 'LaunchApp',
  app: 'LaunchApp',

  // Filesystem
  ls: 'List',
  dir: 'List',
  cp: 'Copy',
  mv: 'Move',
  rm: 'Delete',
  del: 'Delete',
  mkdir: 'Mkdir',
  md: 'Mkdir',

  // Data
  json: 'JsonParse',
  yaml: 'YamlParse',
  yml: 'YamlParse',
  csv: 'CsvParse',
  xml: 'XmlParse',

  // Git
  st: 'GitStatus',
  status: 'GitStatus',
  br: 'GitBranch',
  branch: 'GitBranch',
  co: 'GitCheckout',
  checkout: 'GitCheckout',
  ci: 'GitCommit',
  commit: 'GitCommit',
  di: 'GitDiff',
  diff: 'GitDiff',
  lg: 'GitLog',
  log: 'GitLog',
  ps: 'GitPush',
  push: 'GitPush',
  pl: 'GitPull',
  pull: 'GitPull',
  clone: 'GitClone',
  add: 'GitAdd',
  reset: 'GitReset',
  stash: 'GitStash',
  merge: 'GitMerge',
  remote: 'GitRemote',
  blame: 'GitBlame',

  // Network
  http: 'HttpRequest',
  dl: 'DownloadFile',
  download: 'DownloadFile',
  ul: 'UploadFile',
  upload: 'UploadFile',
  api: 'ApiCall',

  // Code
  ast: 'ParseAst',
  parse: 'ParseAst',
  analyze: 'AnalyzeCode',
  lint: 'Lint',
  deps: 'FindDeps',
  cloc: 'CountLines',

  // Memory
  mem: 'Remember',
  save: 'Remember',

  // Image
  img: 'ImageInfo',

  // Search
  search: 'Search',
  websearch: 'WebSearch',
  google: 'WebSearch',
  ddg: 'WebSearch',

  // Refactor
  rename: 'RefactorRename',
  extract: 'RefactorExtract',
  inline: 'RefactorInline',
  organize: 'RefactorOrganizeImports',
  orgimports: 'RefactorOrganizeImports',

  // Math
  solve: 'MathSolve',
  plot: 'MathPlot',
  explain: 'MathExplain',
};

/**
 * Resolve a user-provided tool name through the alias map.
 * Case-insensitive matching. Returns the canonical name or undefined.
 */
export function resolveAlias(name: string): string | undefined {
  return TOOL_ALIASES[name.toLowerCase()];
}

/**
 * Fuzzy-find tool names that match a query.
 *
 * Uses semantic TF-IDF scoring as primary method.
 * Falls back to simple substring matching if semantic index is not built.
 *
 * Scoring (higher first):
 * - 100: exact match (case-insensitive)
 * - 95:  alias match
 * - 80:  prefix match
 * - 40-99: semantic TF-IDF match (based on cosine similarity)
 * - 25:  CamelCase part match
 *
 * Results are sorted by score descending, then alphabetically.
 */
export function fuzzyFindTools(query: string, names: string[]): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Try semantic search first (TF-IDF based)
  try {
    const semanticResults = semanticFindTools(q, names, TOOL_ALIASES, 20);
    if (semanticResults.length > 0) {
      return semanticResults;
    }
  } catch {
    // Semantic index not available — fall through to simple matching
  }

  // Fallback: simple prefix/substring/CamelCase matching
  const scored = names.map((n) => {
    const l = n.toLowerCase();
    let score = 0;

    if (l === q) {
      score = 100;
    } else if (l.startsWith(q)) {
      score = 80;
    } else if (l.includes(q)) {
      score = 50;
    } else {
      // Split CamelCase into parts: "GitStatus" → ["git", "status"]
      const parts = n.split(/(?<=[a-z])(?=[A-Z])/).map((p) => p.toLowerCase());
      const joined = parts.join('');
      if (parts.some((p) => p.includes(q)) || joined.includes(q)) {
        score = 30;
      }
    }

    return { name: n, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((s) => s.name);
}

/** Rebuild the semantic index from the current tool registry. Call after tools change. */
export { rebuildSemanticIndex } from './semantic-index.js';
