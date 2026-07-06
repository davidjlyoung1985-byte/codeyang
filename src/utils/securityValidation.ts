/**
 * Security validation utilities
 *
 * Provides input validation to prevent:
 * - Path traversal attacks
 * - Command injection
 * - SSRF (Server-Side Request Forgery)
 */

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly category: string,
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ── Path Validation ──────────────────────────────────────────

const MAX_PATH_LENGTH = 4096;
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/, // ../  or  ..\
  /[\/\\]\.\./, // /..  or  \..
  /%2e%2e[\/\\]/i, // URL encoded ../
  /%2e%2e%2f/i, // URL encoded ../
  /\0/, // Null byte
  /[\r\n]/, // Newlines
];

/**
 * Check if path contains traversal patterns
 */
export function isPathTraversal(path: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Validate and sanitize file path
 * Throws SecurityError if path is suspicious
 */
export function validatePath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new SecurityError('Path must be a non-empty string', 'INVALID_PATH');
  }

  if (path.length > MAX_PATH_LENGTH) {
    throw new SecurityError(`Path exceeds maximum length (${MAX_PATH_LENGTH})`, 'PATH_TOO_LONG');
  }

  // Decode URL encoding to catch encoded traversal attempts
  const decoded = decodeURIComponent(path);

  if (isPathTraversal(decoded)) {
    throw new SecurityError(`Path contains traversal pattern: ${path}`, 'PATH_TRAVERSAL');
  }

  if (isPathTraversal(path)) {
    throw new SecurityError(`Path contains traversal pattern: ${path}`, 'PATH_TRAVERSAL');
  }

  return path;
}

// ── Command Validation ──────────────────────────────────────────

const MAX_COMMAND_LENGTH = 8192;
const COMMAND_INJECTION_PATTERNS = [
  /;/, // Command separator
  /\|/, // Pipe
  /&&/, // AND operator
  /\|\|/, // OR operator
  /`/, // Backtick (command substitution)
  /\$\(/, // Command substitution
  /\r|\n/, // Newlines
  />/, // Redirect output
  /<(?!-)/, // Redirect input (but allow hyphen for args)
];

/**
 * Check if command is safe (no injection patterns)
 */
export function isSafeCommand(command: string): boolean {
  return !COMMAND_INJECTION_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Validate command for shell execution
 * Throws SecurityError if command contains injection patterns
 */
export function validateCommand(command: string): string {
  if (!command || typeof command !== 'string') {
    throw new SecurityError('Command must be a non-empty string', 'INVALID_COMMAND');
  }

  if (command.length > MAX_COMMAND_LENGTH) {
    throw new SecurityError(`Command exceeds maximum length (${MAX_COMMAND_LENGTH})`, 'COMMAND_TOO_LONG');
  }

  if (!isSafeCommand(command)) {
    throw new SecurityError(`Command contains dangerous patterns: ${command}`, 'COMMAND_INJECTION');
  }

  return command;
}

/**
 * Sanitize shell argument by quoting if necessary
 */
export function sanitizeShellArg(arg: string): string {
  // If argument contains spaces or special chars, quote it
  if (/[\s"';`$|&<>(){}[\]\\]/.test(arg)) {
    // Escape any existing quotes
    const escaped = arg.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return arg;
}

// ── URL Validation (SSRF Protection) ──────────────────────────────────────────

const ALLOWED_SCHEMES = ['http:', 'https:'];
const PRIVATE_IP_PATTERNS = [
  /^127\./, // 127.0.0.0/8
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^0\./, // 0.0.0.0/8
];

const LOCALHOST_PATTERNS = [
  'localhost',
  '0.0.0.0',
  '::1', // IPv6 localhost
  '[::]',
];

/**
 * Check if IP address is private/internal
 */
export function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * Validate URL to prevent SSRF attacks
 * Throws SecurityError if URL targets private/internal resources
 */
export function validateUrl(urlString: string): URL {
  if (!urlString || typeof urlString !== 'string') {
    throw new SecurityError('URL must be a non-empty string', 'INVALID_URL');
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SecurityError(`Invalid URL: ${urlString}`, 'INVALID_URL');
  }

  // Check protocol
  if (!ALLOWED_SCHEMES.includes(url.protocol)) {
    throw new SecurityError(
      `URL scheme not allowed: ${url.protocol} (allowed: ${ALLOWED_SCHEMES.join(', ')})`,
      'INVALID_URL_SCHEME',
    );
  }

  // Check for localhost
  const hostname = url.hostname.toLowerCase();
  if (LOCALHOST_PATTERNS.some((pattern) => hostname.includes(pattern))) {
    throw new SecurityError(`URL targets localhost: ${url.hostname}`, 'SSRF_LOCALHOST');
  }

  // Check for private IPs
  if (isPrivateIP(hostname)) {
    throw new SecurityError(`URL targets private IP: ${url.hostname}`, 'SSRF_PRIVATE_IP');
  }

  return url;
}

// ── Input Sanitization ──────────────────────────────────────────

/**
 * Sanitize string input to prevent injection
 */
export function sanitizeInput(input: string, maxLength = 1000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Truncate
  let sanitized = input.slice(0, maxLength);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Validate email-like string (basic check)
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email pattern (not RFC compliant, just sanity check)
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email) && email.length < 255;
}
