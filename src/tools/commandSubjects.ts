/**
 * Shell command segmentation for permission checks.
 *
 * The permission rules in `permission/index.ts` are written against whole
 * commands (`rm -rf*`, `git push --force*`, `curl*|*sh`). Feeding them only the
 * first word of a command — as BashTool used to do — means none of those rules
 * ever match, and destructive commands run without confirmation.
 *
 * These helpers produce the *subjects* each rule should be tested against:
 *
 *   1. the whole command, so pipeline-spanning rules (`curl*|*sh`) can match;
 *   2. each `;` / `&&` / `||` / `|` separated segment, so `cd x && rm -rf y`
 *      is also checked as `rm -rf y`;
 *   3. the contents of `$(...)` and backtick substitutions, so
 *      `echo $(rm -rf /)` is also checked as `rm -rf /`.
 */

/** Separators that start a new command in both bash and PowerShell. */
const COMMAND_SEPARATORS = /[;&|\n]+/;

/**
 * Expand command substitutions in place, keeping the surrounding command so the
 * original subject is still checkable as a whole.
 */
function expandSubstitutions(command: string): string {
  return command
    .replace(/`([^`]+)`/g, (_m, inner: string) => ` ; ${inner} ; `)
    .replace(/\$\(([^)]+)\)/g, (_m, inner: string) => ` ; ${inner} ; `)
    .replace(/\$\((.*)\)/g, (_m, inner: string) => ` ; ${inner} ; `); // nested fallback
}

/**
 * Return every string that should be tested against the permission rules.
 * Order is stable (whole command first) and duplicates are removed.
 */
export function extractCommandSubjects(command: string): string[] {
  const subjects = new Set<string>();

  const whole = command.trim();
  if (whole) subjects.add(whole);

  for (const segment of expandSubstitutions(command).split(COMMAND_SEPARATORS)) {
    const trimmed = segment.trim();
    if (trimmed) subjects.add(trimmed);
  }

  return [...subjects];
}
