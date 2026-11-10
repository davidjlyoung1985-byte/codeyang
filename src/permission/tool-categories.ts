/**
 * Tool → permission category mapping.
 *
 * The permission rules in `permission/index.ts` have always defined `file` and
 * `network` categories, but nothing ever called `checkPermission` for them —
 * only BashTool/PowerShellTool did, with hardcoded `'bash'`. This module makes
 * the mapping explicit so the executor can enforce every category uniformly.
 */
export type ToolCategory = 'bash' | 'file' | 'network';

/** Tools that never need a permission check (read-only, no side effects). */
const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'List',
  'ListFiles',
  'ListImages',
  'Exists',
  'CountLines',
  'QuerySymbols',
  'FindDefinition',
  'FindReferences',
  'FindDeps',
  'Search',
  'SearchProject',
  'AnalyzeCode',
  'Complexity',
  'ParseAst',
  'ImageInfo',
  'ToolSearch',
  'TodoWrite',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'Recall',
  'ListMemories',
  'GitStatus',
  'GitDiff',
  'GitLog',
  'GitBlame',
  'GitCurrentBranch',
  'GitBranch',
  'GitRemote',
  'Question',
  'EnterPlanMode',
  'ExitPlanMode',
  'JsonParse',
  'JsonQuery',
  'XmlParse',
  'YamlParse',
  'CsvParse',
  'Convert',
  'ParseUrl',
]);

/** Tools that write to the filesystem (checked against `file` rules). */
const FILE_MUTATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'Delete', 'Move', 'Copy', 'Mkdir']);

/** Tools that reach the network (checked against `network` rules). */
const NETWORK_TOOLS = new Set([
  'ApiCall',
  'HttpRequest',
  'WebFetch',
  'WebSearch',
  'CheckUrl',
  'DownloadFile',
  'UploadFile',
  'GitClone',
  'GitPull',
  'GitPush',
  'GitHub',
]);

/** Tools that shell out (checked against `bash` rules). */
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'LaunchApp']);

/** Git tools that mutate local state but do not touch the network. */
const GIT_LOCAL_TOOLS = new Set(['GitAdd', 'GitCommit', 'GitCheckout', 'GitMerge', 'GitReset', 'GitStash']);

/**
 * Resolve the permission category for a tool, or `null` when the tool is
 * read-only and needs no check.
 */
export function categoryOf(toolName: string): ToolCategory | null {
  if (SHELL_TOOLS.has(toolName)) return 'bash';
  if (NETWORK_TOOLS.has(toolName)) return 'network';
  if (FILE_MUTATING_TOOLS.has(toolName) || GIT_LOCAL_TOOLS.has(toolName)) return 'file';
  if (READ_ONLY_TOOLS.has(toolName)) return null;
  // Unknown/MCP/plugin tools: assume they can touch the filesystem.
  return 'file';
}

/**
 * Build the string that permission patterns are matched against.
 *
 * - Shell tools match on the command itself.
 * - File tools match on the absolute-ish path.
 * - Network tools match on the URL.
 *
 * Patterns in `permissions.json` are globs (`rm -rf*`, `*`), so this must
 * produce something a user can reason about and write a pattern for.
 */
export function permissionSubject(toolName: string, input: Record<string, unknown>): string {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = input[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  if (SHELL_TOOLS.has(toolName)) {
    return pick('command', 'script', 'cmd');
  }
  if (NETWORK_TOOLS.has(toolName)) {
    return pick('url', 'endpoint', 'uri', 'command');
  }
  // File-ish tools: prefer the destination path.
  const path = pick('filePath', 'path', 'targetPath', 'destination', 'destPath', 'source', 'sourcePath');
  if (path) return path;
  // Fall back to a serialized form so a pattern like `*secret*` still works.
  return JSON.stringify(input).slice(0, 500);
}

/**
 * Git remote operation subject: the subcommand plus remote, so rules like
 * `git push --force*` keep matching.
 */
export function gitSubject(toolName: string, input: Record<string, unknown>): string {
  const args: string[] = [];
  for (const key of ['remote', 'branch', 'url', 'target', 'path']) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) args.push(v.trim());
  }
  const base = toolName.replace(/^Git/, 'git ').toLowerCase();
  return args.length > 0 ? `${base} ${args.join(' ')}` : base;
}
