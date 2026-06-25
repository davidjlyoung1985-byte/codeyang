import { execa } from 'execa';
import { checkPermission } from '../permission/index.js';
import { auditLog } from '../utils/sessionStore.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

// User-customizable deny list from env var (comma-separated words)
const DENY_LIST = (process.env['CODEYANG_DENY_COMMANDS'] || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Permission cache: avoids redundant async checkPermission calls within TTL. */
const permissionCache = new Map<string, { level: string; timestamp: number }>();
const PERMISSION_CACHE_TTL = 5_000; // 5 seconds (short TTL to avoid stale cached permissions)

/**
 * Check if a command matches any deny-listed word.
 * Enhanced parsing to handle quotes, escapes, and obfuscation attempts.
 */
function isDenied(command: string): boolean {
  // Normalize the command: remove quotes, collapse escapes, lowercase
  const normalized = command
    .replace(/['"\\]/g, '') // Remove quotes and backslashes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .toLowerCase()
    .trim();

  // Split by shell metacharacters while preserving command structure
  const tokens = normalized.split(/[\s;|&`$()<>{}[\]]+/).filter(Boolean);

  for (const token of tokens) {
    for (const denied of DENY_LIST) {
      const deniedLower = denied.toLowerCase();

      // Exact match or prefix match (e.g., "rm" matches "rm", "rmdir")
      if (token === deniedLower || token.startsWith(deniedLower)) {
        return true;
      }

      // Substring match to catch obfuscation like "r""m" → "rm"
      if (token.includes(deniedLower)) {
        return true;
      }
    }
  }

  // Additional checks for suspicious command injection patterns
  // Note: rm -rf, $(), backticks, and { } are NOT blocked here because
  // they are legitimate shell syntax used in normal development.
  // The DENY_LIST above handles user-configured blocks.
  const suspiciousPatterns = [
    /curl.*\|\s*(sh|bash)/i, // curl | sh — remote code execution
    /wget.*\|\s*(sh|bash)/i, // wget | sh — remote code execution
    />\s*\/dev\/sd/i, // write to raw disk device
    /mkfs/i, // format filesystem
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(command)) {
      return true;
    }
  }

  return false;
}

/**
 * SECURITY: Sanitize command string before logging to prevent credential leakage
 *
 * Redacts common patterns for passwords, tokens, and API keys in command arguments
 */
function sanitizeForLogging(command: string): string {
  let sanitized = command;

  // Redact password arguments: -p password, --password=xxx, -u user:pass
  sanitized = sanitized.replace(/(-p\s+|--password[=\s]+)\S+/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/(-u\s+\S+:)\S+/gi, '$1[REDACTED]');

  // Redact environment variable assignments: VAR=secret
  sanitized = sanitized.replace(/\b(PASSWORD|TOKEN|SECRET|KEY|AUTH)=[^\s;|&]+/gi, '$1=[REDACTED]');

  // Redact API keys and tokens: sk-..., Bearer xxx, token=xxx
  sanitized = sanitized.replace(/\b(sk-[a-zA-Z0-9]{20,})/g, '[REDACTED_API_KEY]');
  sanitized = sanitized.replace(/\b(Bearer\s+)[^\s;|&]+/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/\b(token|apikey|api_key)=[^\s;|&]+/gi, '$1=[REDACTED]');

  // Redact Base64-encoded credentials (common in Authorization headers)
  sanitized = sanitized.replace(/\b([A-Za-z0-9+/]{40,}={0,2})\b/g, '[REDACTED_BASE64]');

  return sanitized;
}

/**
 * Maximum output size in bytes before truncation.
 * Prevents a single command from filling the LLM context window.
 * Configurable via CODEYANG_BASH_MAX_OUTPUT env var (default: 100 KB).
 */
const MAX_OUTPUT_BYTES = (() => {
  const raw = process.env['CODEYANG_BASH_MAX_OUTPUT'];
  if (raw === undefined) return 100 * 1024; // 100 KB
  const val = Number(raw);
  return Number.isNaN(val) || val < 1024 ? 100 * 1024 : val;
})();

/** Maximum lines to include before truncation (safety for line-oriented output). */
const MAX_OUTPUT_LINES = 1000;

/**
 * Truncate output if it exceeds limits, appending a summary of what was omitted.
 */
function truncateOutput(output: string, label: string): string {
  const totalBytes = Buffer.byteLength(output, 'utf-8');
  const lines = output.split('\n');
  const totalLines = lines.length;

  // Fast path: within limits
  if (totalBytes <= MAX_OUTPUT_BYTES && totalLines <= MAX_OUTPUT_LINES) {
    return output;
  }

  let truncated = false;

  // Truncate by lines first (preserves line integrity)
  if (totalLines > MAX_OUTPUT_LINES) {
    const keepHead = Math.floor(MAX_OUTPUT_LINES * 0.7); // 700 lines from start
    const keepTail = MAX_OUTPUT_LINES - keepHead; // 300 lines from end
    const head = lines.slice(0, keepHead);
    const tail = lines.slice(totalLines - keepTail);
    output = [...head, `... [${totalLines - keepHead - keepTail} lines omitted]`, ...tail].join('\n');
    truncated = true;
  }

  // Truncate by byte size (after line truncation, in case lines are very long)
  const newBytes = Buffer.byteLength(output, 'utf-8');
  if (newBytes > MAX_OUTPUT_BYTES) {
    const keepBytes = Math.floor(MAX_OUTPUT_BYTES * 0.8); // keep 80% at start
    const keepHead = output.slice(0, keepBytes);
    const omittedBytes = newBytes - keepBytes;
    output =
      keepHead +
      `\n... [${(omittedBytes / 1024).toFixed(1)} KB of ${label} omitted — ` +
      `output exceeds ${(MAX_OUTPUT_BYTES / 1024).toFixed(0)} KB limit]`;
    truncated = true;
  }

  if (truncated) {
    const finalBytes = Buffer.byteLength(output, 'utf-8');
    output +=
      `\n[${label}: ${(totalBytes / 1024).toFixed(1)} KB total, ` + `returned ${(finalBytes / 1024).toFixed(1)} KB]`;
  }

  return output;
}

/**
 * Execute a shell command with permission checks.
 */
export async function executeBash(command: string, cwd?: string, timeoutSecs = 30): Promise<string> {
  // Rate limit check first
  checkRateLimit('bash');

  // Security: always check deny list first (hard security boundary)
  if (isDenied(command)) {
    void auditLog({
      action: 'bash_denied',
      command: sanitizeForLogging(command), // SECURITY: Redact sensitive info
      cwd: cwd || process.cwd(),
      result: 'blocked_by_deny_list',
    });
    throw new Error(`[SAFETY] Command blocked by deny list.`);
  }

  // Check permission system for all commands
  // SECURITY: Also extract commands from backtick `cmd` and $() subshells
  // to prevent permission bypass via command substitution
  const baseCommands = command
    .replace(/`([^`]+)`/g, (_, inner) => inner) // backtick substitution
    .replace(/\$\(([^)]+)\)/g, (_, inner) => inner) // $() substitution
    .replace(/[;&|`$()<>{}[\]]+/g, ' ') // replace metacharacters with spaces
    .split(/\s+/)
    .filter(Boolean);
  const seenCommands = new Set<string>();
  for (const segment of baseCommands) {
    const firstWord = segment.split(' ')[0].trim();
    if (!firstWord || seenCommands.has(firstWord)) continue;
    seenCommands.add(firstWord);
    // Check permission cache first
    const cached = permissionCache.get(firstWord);
    if (cached && Date.now() - cached.timestamp < PERMISSION_CACHE_TTL) {
      if (cached.level === 'deny') {
        throw new Error(`[PERMISSION DENIED] This command is not permitted.`);
      }
      if (cached.level === 'ask') {
        throw new Error(`[PERMISSION REQUIRED] This operation needs user confirmation.`);
      }
      continue; // 'allow' — cache hit, skip async check
    }
    const perm = await checkPermission('bash', firstWord);
    permissionCache.set(firstWord, { level: perm.level, timestamp: Date.now() });
    if (perm.level === 'deny') {
      throw new Error(`[PERMISSION DENIED] ${perm.reason || 'This command is not permitted.'}`);
    }
    if (perm.level === 'ask') {
      throw new Error(`[PERMISSION REQUIRED] ${perm.reason || 'This operation needs user confirmation.'}`);
    }
  }

  const result = await execa(command, {
    shell: process.platform === 'win32' ? 'powershell.exe' : 'bash',
    cwd: cwd || process.cwd(),
    timeout: timeoutSecs * 1000,
    reject: false,
    env: { ...process.env, CI: undefined },
  });

  const rawStdout = result.stdout?.trim() || '';
  const rawStderr = result.stderr?.trim() || '';
  const label = `stdout of \`${command.slice(0, 80)}${command.length > 80 ? '…' : ''}\``;

  // Apply truncation to both stdout and stderr separately.
  // This way, error messages from stderr are preserved even if stdout is huge.
  const stdout = rawStdout ? truncateOutput(rawStdout, label) : '';
  const stderr = rawStderr
    ? truncateOutput(rawStderr, `stderr of \`${command.slice(0, 80)}${command.length > 80 ? '…' : ''}\``)
    : '';

  if (result.exitCode === 0) {
    const output = stdout || '(no output)';
    return stderr ? `${output}\n\n(stderr):\n${stderr}` : output;
  }

  const parts: string[] = [];
  if (stdout) parts.push(`stdout:\n${stdout}`);
  if (stderr) parts.push(`stderr:\n${stderr}`);
  parts.push(`exit code: ${result.exitCode}`);

  return parts.join('\n\n');
}

/** Clear permission cache (for testing) */
export function clearPermissionCache(): void {
  permissionCache.clear();
}
