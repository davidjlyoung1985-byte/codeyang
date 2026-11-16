/**
 * Centralised path-argument enforcement for tool calls.
 *
 * ── Why this exists ──
 * `tools/shared.ts#resolveSafePath` has always been the correct sandbox check.
 * But it was a *convention*: each tool had to remember to call it. An audit
 * found five that did not —
 *
 *   GrepTool, GlobTool, CodeAnalysisTool (6 call sites), SearchTool
 *
 * all of which read files outside `CODEX_SANDBOX`. Every one of them passed its
 * own tests, because those tests never set a sandbox.
 *
 * Rather than auditing 28 tools and hoping the next one remembers, the check
 * now happens here, in the single place every built-in tool call already flows
 * through (`registry.ts#validatedExecute`). A tool can still call
 * `resolveSafePath` itself — that is harmless and keeps it correct when used
 * directly — but it can no longer *forget* to.
 *
 * ── What counts as a path ──
 * Derived from the schema, not a hardcoded tool list: any top-level string
 * property whose name looks like a filesystem path (`path`, `filePath`,
 * `cwd`, `root`, `dir`, ...). Tools that take a command string (`Bash`) or a
 * URL (`WebFetch`) are intentionally out of scope — those have their own
 * controls, and mangling them here would break them.
 */

import { resolveSafePath } from './shared.js';

/**
 * Argument names treated as filesystem paths.
 *
 * Deliberately conservative and suffix-based, so `filePath`, `sourcePath`,
 * `targetPath`, `rootDir`, `workingDirectory` are all caught without listing
 * every spelling.
 */
const PATH_ARG_PATTERN =
  /^(path|file|filepath|filename|dir|directory|root|rootdir|cwd|source|src|destination|dest|target|output|input|from|to)$/i;

/** Names that look like paths but are not, or must be left alone. */
const PATH_ARG_DENYLIST = new Set([
  'include', // a glob, matched against names — not a path we resolve
  'query', // free text
  'pattern', // regex
  'url', // handled by SSRF checks
  'command', // handled by the permission system
  'content',
  'message',
]);

/** True when `name` should be validated as a filesystem path. */
export function isPathArgName(name: string): boolean {
  if (PATH_ARG_DENYLIST.has(name.toLowerCase())) return false;
  if (PATH_ARG_PATTERN.test(name)) return true;
  // Camel-case compounds: `filePath`, `sourceDir`, `targetFile`.
  return /(path|file|dir|directory|root|cwd)$/i.test(name);
}

/**
 * Tools whose path arguments are *outputs* the agent may legitimately create
 * anywhere the sandbox allows, but whose value may also be a URL or a bare
 * application name. Kept explicit so the behaviour is reviewable.
 */
const TOOLS_SKIPPING_PATH_CHECK = new Set([
  'LaunchApp', // may be an app name (whitelisted separately) or a URL
  'WebFetch', // URL, guarded by SSRF validation
  'WebSearch', // query text
]);

export interface PathViolation {
  argName: string;
  value: string;
  message: string;
}

/**
 * Validate every path-like argument in `args`.
 *
 * Returns the list of violations (empty when everything is allowed). It does
 * not throw, so the caller can format a single readable refusal listing every
 * offending argument rather than the first one.
 */
export function findPathViolations(toolName: string, args: Record<string, unknown>): PathViolation[] {
  if (TOOLS_SKIPPING_PATH_CHECK.has(toolName)) return [];

  const violations: PathViolation[] = [];

  for (const [argName, rawValue] of Object.entries(args ?? {})) {
    if (typeof rawValue !== 'string' || rawValue.length === 0) continue;
    if (!isPathArgName(argName)) continue;

    try {
      // Only validating — the tool resolves the path again for its own use.
      resolveSafePath(rawValue);
    } catch (err) {
      violations.push({
        argName,
        value: rawValue,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return violations;
}

/**
 * Turn violations into the message the model sees.
 *
 * Phrased as a hard refusal, not a tool error: the model must not read this as
 * "try a different path".
 */
export function formatPathViolations(toolName: string, violations: PathViolation[]): string {
  const details = violations.map((v) => `  - ${v.argName}: ${v.message.split('\n')[0]}`).join('\n');
  return (
    `[SECURITY] ${toolName} refused: path outside the allowed root.\n${details}\n` +
    `The sandbox boundary is not negotiable — do not retry with a different path.`
  );
}
