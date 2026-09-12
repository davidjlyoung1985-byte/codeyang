/**
 * Input Validation Utilities
 *
 * Provides security-focused validation functions for user inputs
 * to prevent common vulnerabilities like path traversal, command injection,
 * SSRF, and other security issues.
 */

import { isAbsolute, normalize, resolve } from 'node:path';

/**
 * Validate file path for security issues
 *
 * Checks for:
 * - Path traversal attacks (..)
 * - Access to sensitive system directories
 * - Relative paths (must be absolute)
 *
 * @param path - File path to validate
 * @param allowedRoot - Optional: restrict to specific root directory
 * @returns true if path is safe
 */
export function validateFilePath(path: string, allowedRoot?: string): boolean {
  // Check for empty path
  if (!path || path.trim().length === 0) {
    return false;
  }

  // Normalize the path first to resolve .. and .
  const normalizedPath = normalize(path);

  // Check if normalization resulted in path traversal
  // After normalize, '..' should be resolved away
  // If the original path had '..', normalize would have changed it
  if (path.includes('..')) {
    return false;
  }

  // Must be absolute path for security
  if (!isAbsolute(normalizedPath)) {
    return false;
  }

  // Check against dangerous system directories
  const dangerousDirs = ['/etc', '/sys', '/proc', '/dev', '/root'];

  const dangerousWinDirs = ['C:\\Windows', 'C:\\System', 'C:\\Program Files\\WindowsApps'];

  // Case-sensitive check for Unix paths
  for (const dir of dangerousDirs) {
    if (normalizedPath.startsWith(dir)) {
      return false;
    }
  }

  // Case-insensitive check for Windows paths
  const lowerPath = normalizedPath.toLowerCase();
  for (const dir of dangerousWinDirs) {
    if (lowerPath.startsWith(dir.toLowerCase())) {
      return false;
    }
  }

  // If allowedRoot specified, ensure path is within it
  if (allowedRoot) {
    const resolvedRoot = resolve(allowedRoot);
    const resolvedPath = resolve(normalizedPath);

    if (!resolvedPath.startsWith(resolvedRoot)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitize shell command to prevent injection
 *
 * Removes or escapes dangerous shell characters
 *
 * @param cmd - Command to sanitize
 * @returns Sanitized command
 */
export function sanitizeCommand(cmd: string): string {
  if (!cmd) return '';

  // Remove dangerous shell metacharacters
  // Keep only alphanumeric, spaces, hyphens, underscores, dots
  return cmd.replace(/[;&|`$(){}[\]<>'"\\!*?#~\/]/g, '');

  /**
   * Validate command is safe to execute
   *
   * @param cmd - Command to validate
   * @param allowedCommands - Whitelist of allowed commands
   * @returns true if command is safe
   */
  export function validateCommand(cmd: string, allowedCommands?: string[]): boolean {
    if (!cmd || cmd.trim().length === 0) {
      return false;
    }

    // Check for shell metacharacters that could be dangerous
    const dangerousChars = /[;&|`$(){}[\]<>\\!]/;
    if (dangerousChars.test(cmd)) {
      return false;
    }

    // If whitelist provided, check command is in it
    if (allowedCommands && allowedCommands.length > 0) {
      const cmdName = cmd.trim().split(/\s+/)[0];
      return allowedCommands.includes(cmdName);
    }

    return true;
  }

  /**
   * Validate URL for SSRF and other attacks
   *
   * Checks for:
   * - Valid URL format
   * - Allowed protocols (http/https only)
   * - No access to internal networks
   * - No IP-based localhost variants
   *
   * @param url - URL to validate
   * @returns true if URL is safe
   */
  export function validateUrl(url: string): boolean {
    if (!url || url.trim().length === 0) {
      return false;
    }

    try {
      const parsed = new URL(url);

      // Only allow http and https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      const hostname = parsed.hostname.toLowerCase();

      // Block localhost variants
      const localhostVariants = ['localhost', '0.0.0.0'];

      if (localhostVariants.includes(hostname)) {
        return false;
      }

      // Block 127.x.x.x range
      if (hostname.startsWith('127.')) {
        return false;
      }

      // Block IPv6 localhost
      if (hostname === '::1' || hostname.includes('0000:0000:0000:0000:0000:0000:0000:0001')) {
        return false;
      }

      // Block private IP ranges
      if (isPrivateIP(hostname)) {
        return false;
      }

      // Block link-local addresses
      if (hostname.startsWith('169.254.') || hostname.startsWith('fe80:')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if hostname/IP is in private IP range
   */
  function isPrivateIP(hostname: string): boolean {
    // Check for IPv4 private ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);

    if (match) {
      const octets = match.slice(1, 5).map(Number);

      // 10.0.0.0/8
      if (octets[0] === 10) return true;

      // 172.16.0.0/12
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;

      // 192.168.0.0/16
      if (octets[0] === 192 && octets[1] === 168) return true;

      // 100.64.0.0/10 (Carrier-grade NAT)
      if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
    }

    // Check for IPv6 private ranges
    if (hostname.includes(':')) {
      // fd00::/8 (Unique Local Addresses)
      if (hostname.startsWith('fd')) return true;
      // fc00::/7
      if (hostname.startsWith('fc')) return true;
    }

    return false;
  }

  /**
   * Sanitize user input for display or storage
   *
   * Prevents XSS and other injection attacks
   *
   * @param input - User input to sanitize
   * @returns Sanitized string
   */
  export function sanitizeInput(input: string): string {
    if (!input) return '';

    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate email format (basic check)
   */
  export function validateEmail(email: string): boolean {
    if (!email) return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate that string contains only alphanumeric characters
   *
   * @param str - String to validate
   * @param allowSpaces - Allow spaces
   * @param allowDashes - Allow hyphens and underscores
   * @returns true if valid
   */
  export function isAlphanumeric(str: string, allowSpaces = false, allowDashes = false): boolean {
    if (!str) return false;

    let pattern = '^[a-zA-Z0-9';
    if (allowSpaces) pattern += '\\s';
    if (allowDashes) pattern += '-_';
    pattern += ']+$';

    const regex = new RegExp(pattern);
    return regex.test(str);
  }

  /**
   * Validate git reference (branch name, tag, commit hash)
   *
   * @param ref - Git reference to validate
   * @returns true if valid
   */
  export function validateGitRef(ref: string): boolean {
    if (!ref || ref.trim().length === 0) {
      return false;
    }

    // Git ref rules:
    // - Cannot start or end with dot
    // - Cannot contain ".." or "@{"
    // - Cannot contain special chars: ~, ^, :, ?, *, [, \, space
    // - Cannot end with .lock
    // - Cannot be a single "@"

    if (ref === '@') return false;
    if (ref.startsWith('.') || ref.endsWith('.')) return false;
    if (ref.endsWith('.lock')) return false;
    if (ref.includes('..') || ref.includes('@{')) return false;

    const invalidChars = /[~^:?*[\\\s]/;
    if (invalidChars.test(ref)) return false;

    return true;
  }

  /**
   * Validate port number
   *
   * @param port - Port number to validate
   * @returns true if valid (1-65535)
   */
  export function validatePort(port: number | string): boolean {
    const portNum = typeof port === 'string' ? parseInt(port, 10) : port;

    if (isNaN(portNum)) return false;
    if (!Number.isInteger(portNum)) return false;
    if (portNum < 1 || portNum > 65535) return false;

    // Additional check: if string, ensure it's purely numeric
    if (typeof port === 'string' && !/^\d+$/.test(port)) return false;

    return true;
  }

  /**
   * Validate environment variable name
   *
   * @param name - Variable name to validate
   * @returns true if valid
   */
  export function validateEnvVarName(name: string): boolean {
    if (!name) return false;

    // Env var names: uppercase letters, numbers, underscores
    // Cannot start with number
    const regex = /^[A-Z_][A-Z0-9_]*$/;
    return regex.test(name);
  }

  /**
   * Rate limit key validation
   * Ensures keys are safe for use in caches/stores
   */
  export function validateCacheKey(key: string): boolean {
    if (!key || key.length === 0) return false;
    if (key.length > 256) return false; // Reasonable limit

    // Only allow safe characters
    const safeKeyRegex = /^[a-zA-Z0-9:._-]+$/;
    return safeKeyRegex.test(key);
  }

  /**
   * Sanitize log output to prevent log injection
   *
   * @param message - Log message to sanitize
   * @returns Sanitized message
   */
  export function sanitizeLogMessage(message: string): string {
    if (!message) return '';

    // Remove newlines and carriage returns to prevent log injection
    return message.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  }

  /**
   * Redact sensitive information from logs
   *
   * @param obj - Object to redact
   * @returns Redacted object
   */
  export function redactSensitiveData(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'apikey',
      'api_key',
      'authorization',
      'auth',
      'credential',
      'private_key',
      'access_token',
      'refresh_token',
    ];

    const redacted: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some((s) => lowerKey.includes(s));

      if (isSensitive && typeof value === 'string') {
        redacted[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  return redacted;
}
