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
import { join } from 'node:path';
import { homedir } from 'node:os';

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

const CONFIG_PATH = join(homedir(), '.codeyang', 'permissions.json');
const DEFAULT_CONFIG: PermissionConfig = {
  version: 2,
  rules: [
    // Bash dangerous operations — default: ask
    { pattern: 'rm -rf *', level: 'ask', category: 'bash', reason: 'Recursive force delete' },
    { pattern: 'sudo *', level: 'ask', category: 'bash', reason: 'Sudo requires confirmation' },
    { pattern: 'git push --force*', level: 'ask', category: 'bash', reason: 'Force push is destructive' },
    { pattern: 'git push -f*', level: 'ask', category: 'bash', reason: 'Force push is destructive' },
    { pattern: 'curl *| sh', level: 'deny', category: 'bash', reason: 'Piping curl to shell is dangerous' },
    { pattern: 'curl *| bash', level: 'deny', category: 'bash', reason: 'Piping curl to shell is dangerous' },
    { pattern: '> /dev/sd*', level: 'deny', category: 'bash', reason: 'Direct disk write' },
    { pattern: 'mkfs*', level: 'deny', category: 'bash', reason: 'Filesystem creation blocked' },
    // File operations — allow by default
    { pattern: '*', level: 'allow', category: 'file', reason: 'File operations allowed' },
    // Network — allow by default
    { pattern: '*', level: 'allow', category: 'network', reason: 'Network allowed' },
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
    await mkdir(join(homedir(), '.codeyang'), { recursive: true });
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

  for (const rule of categoryRules) {
    // Convert glob pattern to regex, but prevent ReDoS by using non-backtracking quantifiers
    // where possible and limiting pattern complexity
    const escaped = rule.pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex metacharacters first
      .replace(/\*/g, '[^\\s]*') // * matches non-whitespace (prevents catastrophic backtracking)
      .replace(/\?/g, '[^\\s]'); // ? matches single non-whitespace char

    try {
      const regex = new RegExp(`^${escaped}$`, 'i');
      if (regex.test(input.trim())) {
        return { level: rule.level, reason: rule.reason };
      }
    } catch {
      // Invalid regex from pattern — skip this rule
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
