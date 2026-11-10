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
    // Bash dangerous operations — default: ask
    { pattern: 'rm -rf*', level: 'ask', category: 'bash', reason: 'Recursive force delete' },
    { pattern: 'sudo*', level: 'ask', category: 'bash', reason: 'Sudo requires confirmation' },
    { pattern: 'git push --force*', level: 'ask', category: 'bash', reason: 'Force push is destructive' },
    { pattern: 'git push -f*', level: 'ask', category: 'bash', reason: 'Force push is destructive' },
    { pattern: 'curl*|*sh', level: 'deny', category: 'bash', reason: 'Piping curl to shell is dangerous' },
    { pattern: 'curl*|*bash', level: 'deny', category: 'bash', reason: 'Piping curl to shell is dangerous' },
    { pattern: '> /dev/sd*', level: 'deny', category: 'bash', reason: 'Direct disk write' },
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

async function loadConfig(): Promise<PermissionConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const data = await readFile(CONFIG_PATH, 'utf-8');
    cachedConfig = JSON.parse(data);
    return cachedConfig!;
  } catch {
    // Create default config
    await mkdir(getCodeyangHome(), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    cachedConfig = { ...DEFAULT_CONFIG, rules: [...DEFAULT_CONFIG.rules] };
    return cachedConfig;
  }
}

/**
 * Check a command/path against permission rules.
 * Returns the effective permission level and reason.
 */
export async function checkPermission(
  category: PermissionRule['category'],
  input: string,
): Promise<{ level: PermissionLevel; reason?: string }> {
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
    try {
      // For bash commands, use simple wildcard matching (not file-path based)
      // For file/network, use minimatch
      let matched = false;

      if (category === 'bash') {
        // Simple wildcard matching for bash commands
        const regex = rule.pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special regex chars
          .replace(/\*/g, '.*') // * matches any characters
          .replace(/\?/g, '.'); // ? matches single char
        matched = new RegExp(`^${regex}$`, 'i').test(subject);
      } else {
        // Use minimatch for file paths and URLs
        matched = minimatch(subject, rule.pattern, { nocase: true, dot: true });
      }

      if (matched) {
        return { level: rule.level, reason: rule.reason };
      }
    } catch {
      // Invalid pattern — skip this rule
      continue;
    }
  }

  // Default: allow
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
 * Reload permission config from disk.
 */
export async function reloadPermissions(): Promise<void> {
  cachedConfig = null;
  await loadConfig();
}
