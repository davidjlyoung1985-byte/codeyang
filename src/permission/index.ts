/**
 * Permission system — rule-based access control for Bash, File, and Network operations.
 *
 * Three levels per operation:
 *   - "allow" — execute without confirmation
 *   - "deny"  — block with error message
 *   - "ask"   — ask user via Question tool (default for dangerous ops)
 *
 * Rules are stored in ~/.codeyang/permissions.json and checked at runtime.
 *
 * Env var overrides:
 *   CODEYANG_PERMIT_RM     — "allow" to skip rm -rf confirmation
 *   CODEYANG_PERMIT_SUDO   — "allow" to skip sudo confirmation
 *   CODEYANG_PERMIT_FORCE  — "allow" to skip git push --force confirmation
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { minimatch } from 'minimatch';
import { codeyangPath, getCodeyangHome } from '../utils/paths.js';

export type PermissionLevel = 'allow' | 'deny' | 'ask';

export interface PermissionRule {
  pattern: string; // glob or regex pattern matching the command/path
  level: PermissionLevel;
  category: 'bash' | 'file' | 'network';
  reason?: string;
}

interface PermissionConfig {
  version: number;
  rules: PermissionRule[];
}

const CONFIG_PATH = codeyangPath('permissions.json');
const DEFAULT_CONFIG: PermissionConfig = {
  version: 2,
  rules: [
    // ── Bash ──────────────────────────────────────────────────────────
    //
    // MATCHING: patterns are anchored (`^...$`), case-insensitive, and only
    // `*` / `?` are wildcards. Each pattern is tested against the whole command
    // AND against every `;`/`&&`/`|` separated segment (tools/commandSubjects.ts).
    //
    // IMPORTANT — `ask` is NOT a prompt. Nothing implements interactive
    // confirmation, so `ask` behaves exactly like `deny` (BashTool throws).
    // Rules are therefore limited to operations that are unrecoverable or have
    // no legitimate use for a coding agent. Routine work — `git reset --hard`,
    // `git clean -fd`, `rm -rf node_modules`, `chown -R`, `dd` to a file — must
    // stay allowed, otherwise the agent cannot do its job at all.
    //
    // Recursive delete is decided by `isDangerousRmTarget()` (see below) rather
    // than by pattern: `rm -rf dist` is fine, `rm -rf /` is not.
    // Privilege escalation. `sudo*` is anchored, so absolute paths and the
    // common alternatives each need their own rule.
    { pattern: 'sudo*', level: 'ask', category: 'bash', reason: 'Sudo requires confirmation' },
    { pattern: '*/sudo *', level: 'ask', category: 'bash', reason: 'Sudo requires confirmation' },
    { pattern: 'su *', level: 'ask', category: 'bash', reason: 'Switch-user requires confirmation' },
    { pattern: 'doas*', level: 'ask', category: 'bash', reason: 'doas requires confirmation' },
    { pattern: 'pkexec*', level: 'ask', category: 'bash', reason: 'pkexec requires confirmation' },
    // Destructive remote git history
    { pattern: 'git push --force*', level: 'ask', category: 'bash', reason: 'Force push is destructive' },
    { pattern: 'git push -f*', level: 'ask', category: 'bash', reason: 'Force push is destructive' },
    // Remote code execution via pipe-to-shell
    { pattern: 'curl*|*sh', level: 'deny', category: 'bash', reason: 'Piping curl to shell is dangerous' },
    { pattern: 'curl*|*bash', level: 'deny', category: 'bash', reason: 'Piping curl to shell is dangerous' },
    { pattern: 'wget*|*sh', level: 'deny', category: 'bash', reason: 'Piping wget to shell is dangerous' },
    { pattern: 'wget*|*bash', level: 'deny', category: 'bash', reason: 'Piping wget to shell is dangerous' },
    // Raw block-device writes. The pattern is not anchored at the start so that
    // `cat foo > /dev/sda` is caught, not just a command beginning with `>`.
    { pattern: '*> /dev/sd*', level: 'deny', category: 'bash', reason: 'Direct disk write' },
    { pattern: '*> /dev/nvme*', level: 'deny', category: 'bash', reason: 'Direct disk write' },
    { pattern: '*> /dev/hd*', level: 'deny', category: 'bash', reason: 'Direct disk write' },
    { pattern: '*> /dev/mmcblk*', level: 'deny', category: 'bash', reason: 'Direct disk write' },
    { pattern: '*> /dev/disk*', level: 'deny', category: 'bash', reason: 'Direct disk write' },
    { pattern: 'mkfs*', level: 'deny', category: 'bash', reason: 'Filesystem creation blocked' },
    // File operations — bulk deletes and sensitive paths need confirmation.
    // Patterns use `**` (not `*`) because a single `*` never matches a path
    // containing separators.
    { pattern: '**/node_modules', level: 'ask', category: 'file', reason: 'Deleting node_modules' },
    { pattern: '**/node_modules/**', level: 'ask', category: 'file', reason: 'Writing inside node_modules' },
    { pattern: '**/.git/**', level: 'ask', category: 'file', reason: 'Writing inside .git' },
    { pattern: '**/.ssh/**', level: 'deny', category: 'file', reason: 'SSH keys are off-limits' },
    { pattern: '**/.env', level: 'ask', category: 'file', reason: 'Environment file with secrets' },
    { pattern: '**', level: 'allow', category: 'file', reason: 'File operations allowed' },
    // Network — allowed by default, but the category is now actually enforced
    { pattern: '**', level: 'allow', category: 'network', reason: 'Network allowed' },
  ],
};

let cachedConfig: PermissionConfig | null = null;

/**
 * Absolute paths whose recursive deletion would damage the machine (or the
 * user's other work) rather than just the project being worked on.
 */
const SYSTEM_ROOT_PATTERN =
  /^\/(etc|usr|bin|sbin|lib|lib64|boot|sys|proc|dev|var|opt|root|home|srv|run|snap)(\/|$)/;

/**
 * Decide whether a `rm` command is dangerous, based on *what it targets* rather
 * than on how the flags are spelled.
 *
 * This is deliberately path-aware: a coding agent legitimately runs
 * `rm -rf node_modules`, `rm -rf dist`, `rm -rf .next` all day. Those must not
 * be blocked. What must be stopped is deleting the filesystem root, the home
 * directory, or a system directory.
 *
 * Returns a reason string when dangerous, or null when the delete is fine.
 */
export function dangerousRmReason(command: string): string | null {
  const trimmed = command.trim();

  // Only consider commands whose first token is `rm`. Absolute paths
  // (`/bin/rm -rf /`) are matched too.
  const head = trimmed.split(/\s+/)[0] ?? '';
  if (!/(^|\/)rm$/.test(head)) return null;

  // Is this a recursive and/or forced delete? If not, `rm file.txt` is harmless.
  const recursive = /(^|\s)(-[a-zA-Z]*[rR]|--recursive)/.test(trimmed);
  const forced = /(^|\s)(-[a-zA-Z]*f|--force)/.test(trimmed);
  if (!recursive && !forced) return null;

  // Collect operands: drop the command word and every flag token.
  const targets = trimmed
    .split(/\s+/)
    .slice(1)
    .filter((t) => t && !t.startsWith('-'))
    .map((t) => t.replace(/^['"]|['"]$/g, ''));

  if (targets.length === 0) {
    // `rm -rf` with no operand does nothing, but be conservative.
    return null;
  }

  for (const target of targets) {
    // Filesystem root: "/", "/*", "/.", "//"
    if (/^\/+\.?$/.test(target) || /^\/+\*$/.test(target)) {
      return 'Refusing to recursively delete the filesystem root';
    }
    // Home directory: ~, ~/, ~/*, $HOME, $HOME/*
    if (/^~\/?\*?$/.test(target) || /^\$HOME\/?\*?$/.test(target) || /^\/root\/?\*?$/.test(target)) {
      return 'Refusing to recursively delete the home directory';
    }
    // System directories (/etc, /usr, ...)
    if (SYSTEM_ROOT_PATTERN.test(target)) {
      return `Refusing to recursively delete system path ${target}`;
    }
    // Unresolved glob at the root, e.g. `rm -rf /tmp/*` is fine but `/ *` is not.
    if (/^\/\*/.test(target)) {
      return 'Refusing to recursively delete everything under /';
    }
  }

  return null;
}

async function loadConfig(): Promise<PermissionConfig> {
  if (cachedConfig) return cachedConfig;

  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, 'utf-8');
  } catch (err) {
    // Only treat "file does not exist" as "first run, write the defaults".
    // Any other read error (permissions, EIO, ...) must not be interpreted as
    // an empty config, because that would silently widen access.
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw new Error(`[permission] Cannot read ${CONFIG_PATH}: ${(err as Error).message}`);
    }
    await mkdir(getCodeyangHome(), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    cachedConfig = { ...DEFAULT_CONFIG, rules: [...DEFAULT_CONFIG.rules] };
    return cachedConfig;
  }

  let parsed: PermissionConfig;
  try {
    parsed = JSON.parse(raw) as PermissionConfig;
  } catch (err) {
    // A malformed permissions.json must NOT be overwritten with the defaults:
    // doing so would silently discard the user's own deny rules. Surface the
    // error instead so the caller can fail closed, and leave the file intact.
    throw new Error(
      `[permission] ${CONFIG_PATH} is not valid JSON (${(err as Error).message}). ` +
        `Fix or delete it — refusing to silently replace your rules.`,
    );
  }

  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`[permission] ${CONFIG_PATH} is malformed: expected a "rules" array.`);
  }

  cachedConfig = { version: parsed.version ?? 2, rules: parsed.rules };
  return cachedConfig;
}

/**
 * Check a command/path against permission rules.
 * Returns the effective permission level and reason.
 */
export async function checkPermission(
  category: PermissionRule['category'],
  input: string,
): Promise<{ level: PermissionLevel; reason?: string }> {
  // Recursive delete is judged by target path, not by pattern — see
  // dangerousRmReason(). This must run before the rule table so that a user
  // rule cannot accidentally allow `rm -rf /`.
  if (category === 'bash') {
    const rmReason = dangerousRmReason(input);
    if (rmReason) {
      return { level: 'ask', reason: rmReason };
    }
  }

  // Check env overrides first
  if (category === 'bash') {
    if (process.env['CODEYANG_PERMIT_RM'] === 'allow' && /rm\s+-rf/i.test(input)) {
      return { level: 'allow', reason: 'Env override: CODEYANG_PERMIT_RM' };
    }
    if (process.env['CODEYANG_PERMIT_SUDO'] === 'allow' && /sudo/i.test(input)) {
      return { level: 'allow', reason: 'Env override: CODEYANG_PERMIT_SUDO' };
    }
    if (process.env['CODEYANG_PERMIT_FORCE'] === 'allow' && /git\s+push\s+(-f|--force)/i.test(input)) {
      return { level: 'allow', reason: 'Env override: CODEYANG_PERMIT_FORCE' };
    }
  }

  const config = await loadConfig();
  const categoryRules = config.rules
    .filter((r) => r.category === category)
    .sort((a, b) => b.pattern.length - a.pattern.length); // more specific first

  // Normalize Windows separators so glob patterns written with `/` still match.
  const subject = category === 'bash' ? input.trim() : input.trim().replace(/\\/g, '/');

  for (const rule of categoryRules) {
    // A pattern that cannot be evaluated is a broken *rule*, and skipping it
    // would silently downgrade a user's deny rule to the default (allow). Fail
    // closed the same way `deny` does, and say which rule is at fault.
    let matched = false;
    try {
      if (category === 'bash') {
        // Bash commands use simple wildcard matching (not file-path based).
        // `*` -> `.*`, `?` -> `.`, everything else is escaped literally.
        const source = rule.pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special regex chars
          .replace(/\*/g, '.*') // * matches any characters
          .replace(/\?/g, '.'); // ? matches single char
        matched = new RegExp(`^${source}$`, 'i').test(subject);
      } else {
        // Use minimatch for file paths and URLs
        matched = minimatch(subject, rule.pattern, { nocase: true, dot: true });
      }
    } catch (err) {
      throw new Error(
        `[permission] Rule with pattern ${JSON.stringify(rule.pattern)} (${category}) could not be evaluated: ` +
          `${(err as Error).message}. Fix or remove it from permissions.json.`,
      );
    }

    if (matched) {
      return { level: rule.level, reason: rule.reason };
    }
  }

  // Default: allow. The default rule table ends with an explicit `**`/allow
  // entry per category, so reaching this point means no rule applied at all.
  return { level: 'allow' };
}

/**
 * Add a new permission rule (persisted).
 */
export async function addRule(rule: PermissionRule): Promise<void> {
  const config = await loadConfig();
  config.rules.push(rule);
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  cachedConfig = config;
}

/**
 * Drop the cached config so the next check re-reads permissions.json.
 *
 * This is deliberately a pure cache invalidation: it does NOT eagerly parse the
 * file. A malformed permissions.json is reported by the next `checkPermission`
 * call (which fails closed), so a reload never throws on its own.
 */
export async function reloadPermissions(): Promise<void> {
  cachedConfig = null;
}
