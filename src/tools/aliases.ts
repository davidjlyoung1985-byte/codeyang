/**
 * Tool name aliases and fuzzy search support.
 *
 * Aliases map common shorthand names (like `ls`, `cp`, `sh`) to canonical
 * PascalCase tool names (like `List`, `Copy`, `Bash`).
 *
 * fuzzyFindTools provides simple prefix/substring/CamelCase-part scoring to
 * help users discover tools when they don't know the exact name.
 */

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
 * Scoring (higher first):
 * - 100: exact match (case-insensitive)
 * - 80:  starts-with match
 * - 50:  substring match anywhere
 * - 30:  any CamelCase-part contains the query
 *
 * Results are sorted by score descending, then alphabetically.
 */
export function fuzzyFindTools(query: string, names: string[]): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

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
      // Also include the full lowercase name joined without separators
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
