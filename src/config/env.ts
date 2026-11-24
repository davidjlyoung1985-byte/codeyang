/**
 * Environment variable registry — the single source of truth.
 *
 * Every `process.env[...]` read in `src/` must be declared here. That invariant
 * is enforced by `src/config/env-drift.test.ts`, which scans the source tree and
 * fails when a variable is read without being declared, or declared without
 * being read.
 *
 * Why this exists: `src/config/index.ts` claimed to be "unified configuration
 * that replaces scattered process.env access", but it declared 25 names of which
 * 5 were wrong (`CODEYANG_WATCH_MODE` instead of `CODEYANG_WATCH`,
 * `CODEYANG_PLANNER_ENABLED` instead of `CODEYANG_PLANNER`, …) and it covered
 * only 15 of the 61 variables actually read across 27 files. The `--help` text
 * listed 8. Nothing could enumerate the real surface.
 *
 * This module is data-only so it stays importable from tests and from the
 * `--help` renderer without side effects.
 */

export type EnvKind = 'string' | 'int' | 'float' | 'bool' | 'list' | 'secret';

export type EnvCategory =
  | 'api'
  | 'model'
  | 'agent'
  | 'permission'
  | 'sandbox'
  | 'tools'
  | 'memory'
  | 'observability'
  | 'bridge'
  | 'web'
  | 'qt'
  | 'internal';

export interface EnvSpec {
  /** Variable name. */
  name: string;
  kind: EnvKind;
  category: EnvCategory;
  /** Human-readable description shown by `--help`. */
  description: string;
  /** Default applied when unset. Undefined means "no default; caller decides". */
  default?: string | number | boolean;
  /** Values accepted for enum-like variables. */
  choices?: readonly string[];
  /** Hide the value in `--help` (tokens, keys). */
  secret?: boolean;
}

const S = (name: string, category: EnvCategory, description: string, extra: Partial<EnvSpec> = {}): EnvSpec => ({
  name,
  kind: 'string',
  category,
  description,
  ...extra,
});

const I = (name: string, category: EnvCategory, description: string, def?: number): EnvSpec => ({
  name,
  kind: 'int',
  category,
  description,
  default: def,
});

const F = (name: string, category: EnvCategory, description: string, def?: number): EnvSpec => ({
  name,
  kind: 'float',
  category,
  description,
  default: def,
});

const B = (name: string, category: EnvCategory, description: string, def = false): EnvSpec => ({
  name,
  kind: 'bool',
  category,
  description,
  default: def,
});

const L = (name: string, category: EnvCategory, description: string): EnvSpec => ({
  name,
  kind: 'list',
  category,
  description,
  default: '',
});

const SECRET = (name: string, category: EnvCategory, description: string): EnvSpec => ({
  name,
  kind: 'secret',
  category,
  description,
  secret: true,
  default: '',
});

/** All recognised environment variables. */
export const ENV_SPECS: readonly EnvSpec[] = [
  // ── API credentials ────────────────────────────────────────────────
  SECRET('CODEYANG_API_KEY', 'api', 'LLM provider API key'),
  SECRET('DEEPSEEK_API_KEY', 'api', 'Alternative API key for DeepSeek'),
  S('CODEYANG_BASE_URL', 'api', 'Custom API base URL'),
  S('CODEYANG_PROVIDER', 'api', 'LLM provider', {
    choices: ['anthropic', 'deepseek', 'openai'],
    default: 'deepseek',
  }),
  SECRET('CODEYANG_WEB_API_KEY', 'web', 'Bearer token required by the web server'),
  SECRET('GITHUB_TOKEN', 'tools', 'GitHub API token for GitHubTool'),
  SECRET('CODEYANG_SEARCH_KEY', 'tools', 'Search API key (WebSearchTool)'),
  S('CODEYANG_SEARCH_CX', 'tools', 'Search engine ID (WebSearchTool)'),
  S('CODEYANG_SEARCH_API', 'tools', 'Search backend selector', { default: 'google' }),
  S('CODEYANG_SEARCH_URL', 'tools', 'Custom search endpoint'),
  B('CODEYANG_SEARCH_FALLBACK', 'tools', 'Fall back to another backend when search fails', true),

  // ── Model ──────────────────────────────────────────────────────────
  S('CODEYANG_MODEL', 'model', 'Model name', { default: 'deepseek-chat' }),
  I('CODEYANG_MAX_TOKENS', 'model', 'Max tokens per response', 32000),
  F('CODEYANG_TEMPERATURE', 'model', 'Sampling temperature'),

  // ── Agent behaviour ────────────────────────────────────────────────
  B('CODEYANG_AUTO_VERIFY', 'agent', 'Run lint/tsc after Write/Edit', true),
  B('CODEYANG_AUTO_FIX', 'agent', 'Auto-fix lint errors found by verification', true),
  B('CODEYANG_WATCH', 'agent', 'Watch files and re-run verification', true),
  I('CODEYANG_MAX_RETRIES', 'agent', 'Retry budget for failed operations', 3),
  I('CODEYANG_MAX_TURNS', 'agent', 'Maximum agent turns per task', 50),
  I('CODEYANG_STREAM_TIMEOUT', 'agent', 'LLM streaming timeout (ms)', 300000),
  I('CODEYANG_BASH_TIMEOUT', 'agent', 'Bash command timeout (ms)', 60000),
  S('CODEYANG_CWD', 'agent', 'Working directory override'),
  S('CODEYANG_HOME', 'agent', 'CodeYang home directory override'),
  S('PONYTAIL_MODE', 'agent', 'Ponytail methodology mode'),

  // ── Planner / reflexion / prompt cache ─────────────────────────────
  B('CODEYANG_PLANNER', 'agent', 'Enable the planner'),
  B('CODEYANG_PLANNER_AUTO', 'agent', 'Generate plans automatically'),
  B('CODEYANG_PLANNER_APPROVAL', 'agent', 'Require approval before executing a plan'),
  B('CODEYANG_REFLEXION', 'agent', 'Enable the reflexion engine'),
  B('CODEYANG_REFLEXION_AUTO_INJECT', 'agent', 'Inject learned patterns into the prompt'),
  B('CODEYANG_PROMPT_CACHE', 'agent', 'Enable provider prompt caching'),
  I('CODEYANG_PROMPT_CACHE_TTL', 'agent', 'Prompt cache TTL (seconds)'),
  I('CODEYANG_PROMPT_CACHE_MESSAGES', 'agent', 'How many trailing messages to cache'),

  // ── Permissions ────────────────────────────────────────────────────
  S('CODEYANG_PERMIT_RM', 'permission', 'Policy for rm -rf', {
    choices: ['allow', 'ask', 'deny'],
    default: 'ask',
  }),
  S('CODEYANG_PERMIT_SUDO', 'permission', 'Policy for sudo', {
    choices: ['allow', 'ask', 'deny'],
    default: 'deny',
  }),
  S('CODEYANG_PERMIT_FORCE', 'permission', 'Policy for git push --force', {
    choices: ['allow', 'ask', 'deny'],
    default: 'ask',
  }),
  L('CODEYANG_DENY_COMMANDS', 'permission', 'Comma-separated extra denied command words'),
  L('CODEYANG_TRUSTED_GIT_HOSTS', 'permission', 'Comma-separated git hosts considered safe'),
  L('CODEYANG_ALLOW_DRIVES', 'permission', 'Windows drive letters the file tools may touch'),

  // ── Sandbox ────────────────────────────────────────────────────────
  I('CODEYANG_SANDBOX_TIMEOUT', 'sandbox', 'Sandbox execution timeout (ms)', 30000),
  I('CODEYANG_SANDBOX_MAX_STDOUT', 'sandbox', 'Stdout cap before truncation (bytes)', 1048576),
  I('CODEYANG_SANDBOX_MAX_STDERR', 'sandbox', 'Stderr cap before truncation (bytes)', 1048576),
  B('CODEYANG_SANDBOX_BLOCK_NETWORK', 'sandbox', 'Block network access in the sandbox'),
  B('CODEX_SANDBOX', 'sandbox', 'Internal marker: process is sandboxed'),

  // ── Tools ──────────────────────────────────────────────────────────
  I('CODEYANG_BASH_MAX_OUTPUT', 'tools', 'Bash output cap (bytes)', 102400),
  B('CODEYANG_MCP_ALLOW_UNSAFE', 'tools', 'Allow MCP servers that declare unsafe capabilities'),
  I('QT_BUILD_COMPILE_TIMEOUT', 'qt', 'Qt compile timeout (ms)'),
  I('QT_BUILD_CONFIG_TIMEOUT', 'qt', 'Qt configure timeout (ms)'),

  // ── Memory ─────────────────────────────────────────────────────────
  I('CODEYANG_MEMORY_MAX_ENTRIES', 'memory', 'Memory store entry cap'),
  I('CODEYANG_MEMORY_CACHE_TTL', 'memory', 'Memory cache TTL (seconds)'),

  // ── Circuit breaker / rate limits ──────────────────────────────────
  I('CODEYANG_CB_THRESHOLD', 'agent', 'Circuit breaker failure threshold', 5),
  I('CODEYANG_CB_RESET_MS', 'agent', 'Circuit breaker reset timeout (ms)', 30000),
  I('CODEYANG_CB_SLOW_MS', 'agent', 'Slow-call threshold (ms)', 30000),
  I('CODEYANG_CB_WINDOW', 'agent', 'Circuit breaker sampling window', 50),
  F('CODEYANG_CB_RATE', 'agent', 'Failure rate that opens the circuit (0-1)', 0.5),
  I('CODEYANG_CB_MIN_REQ', 'agent', 'Minimum requests before the rate applies', 10),

  // ── Observability ──────────────────────────────────────────────────
  B('CODEYANG_DEBUG', 'observability', 'Verbose debug logging'),
  L('CODEYANG_DEBUG_FILTER', 'observability', 'Comma-separated debug namespaces to show'),
  B('CODEX_DEBUG', 'observability', 'Alternative debug flag honoured by startup checks'),
  B('CODEYANG_TRACING', 'observability', 'Enable the tracer'),
  S('NODE_ENV', 'internal', 'Standard Node environment', { default: 'development' }),

  // ── Bridge (Claude Code / external agent) ──────────────────────────
  S('BRIDGE_URL', 'bridge', 'Bridge server URL', { default: 'http://127.0.0.1:9876' }),
  SECRET('BRIDGE_TOKEN', 'bridge', 'Bridge authentication token'),
  I('BRIDGE_PORT', 'bridge', 'Bridge server port'),

  // ── Web server ─────────────────────────────────────────────────────
  I('CODEYANG_PORT', 'web', 'Web server port', 3000),
  S('CODEYANG_TLS_CERT', 'web', 'TLS certificate path'),
  S('CODEYANG_TLS_KEY', 'web', 'TLS private key path'),

  // ── Process environment (read, never set by us) ────────────────────
  S('PATH', 'internal', 'System PATH (inspected by tools)'),
  S('HOME', 'internal', 'Home directory (inspected by tools)'),
];

/** Lookup map for O(1) access. */
const BY_NAME = new Map<string, EnvSpec>(ENV_SPECS.map((s) => [s.name, s]));

export function getEnvSpec(name: string): EnvSpec | undefined {
  return BY_NAME.get(name);
}

/** All declared variable names. */
export function envNames(): string[] {
  return ENV_SPECS.map((s) => s.name);
}

/** Specs grouped by category, preserving declaration order. */
export function envByCategory(): Map<EnvCategory, EnvSpec[]> {
  const out = new Map<EnvCategory, EnvSpec[]>();
  for (const spec of ENV_SPECS) {
    const list = out.get(spec.category) ?? [];
    list.push(spec);
    out.set(spec.category, list);
  }
  return out;
}
