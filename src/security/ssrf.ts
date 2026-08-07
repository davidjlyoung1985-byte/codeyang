/**
 * SSRF (Server-Side Request Forgery) Protection
 *
 * Validates URLs to prevent access to internal networks, cloud metadata endpoints,
 * and other sensitive resources that could lead to security vulnerabilities.
 */

// No external dependencies - standalone security module

/**
 * Private IP ranges (RFC 1918, RFC 4193, and others)
 */
const PRIVATE_IP_PATTERNS = [
  // IPv4 private ranges
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
  /^192\.168\./, // Class C private
  /^169\.254\./, // Link-local (AWS metadata)
  /^0\.0\.0\.0$/, // Unspecified
  /^255\.255\.255\.255$/, // Broadcast
  // IPv6 private ranges
  /^::1$/, // Loopback
  /^::ffff:/, // IPv4-mapped IPv6
  /^fe80:/i, // Link-local
  /^fc00:/i, // Unique local
  /^fd00:/i, // Unique local
];

/**
 * Dangerous hostnames that should be blocked
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal', // GCP metadata
  '169.254.169.254', // AWS/Azure/GCP metadata endpoint
  'metadata', // Generic cloud metadata
  '0.0.0.0',
];

/**
 * Cloud metadata endpoints
 */
const CLOUD_METADATA_PATTERNS = [
  /metadata\.google\.internal/i,
  /169\.254\.169\.254/, // AWS, Azure, GCP, DigitalOcean
  /169\.254\.170\.2/, // AWS ECS
  /100\.100\.100\.200/, // Alibaba Cloud
  /metadata\.tencentyun\.com/i, // Tencent Cloud
];

/**
 * Check if a hostname resolves to a private IP address
 */
function isPrivateIP(hostname: string): boolean {
  // Direct IP check
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // Check against blocked hostnames
  const lower = hostname.toLowerCase();
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (lower === blocked || lower.endsWith('.' + blocked)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if URL points to a cloud metadata endpoint
 */
function isCloudMetadataEndpoint(url: string): boolean {
  for (const pattern of CLOUD_METADATA_PATTERNS) {
    if (pattern.test(url)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate URL to prevent SSRF attacks
 *
 * @param url - The URL to validate
 * @param allowPrivate - Whether to allow private IP ranges (default: false)
 * @throws Error if URL is dangerous
 */
export function validateUrl(url: string, allowPrivate = false): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`[SSRF Protection] Invalid URL: ${url}\n  💡 Provide a valid HTTP/HTTPS URL.`);
  }

  // Only allow HTTP/HTTPS protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(
      `[SSRF Protection] Unsafe protocol: ${parsed.protocol}\n  💡 Only HTTP and HTTPS protocols are allowed.`,
    );
  }

  const hostname = parsed.hostname;

  // Block cloud metadata endpoints (always dangerous)
  if (isCloudMetadataEndpoint(url) || isCloudMetadataEndpoint(hostname)) {
    throw new Error(
      `[SSRF Protection] Access to cloud metadata endpoints is blocked\n  💡 This endpoint could expose sensitive credentials and configuration.`,
    );
  }

  // Block private IPs unless explicitly allowed
  if (!allowPrivate && isPrivateIP(hostname)) {
    throw new Error(
      `[SSRF Protection] Access to private network is blocked: ${hostname}\n  💡 Access to internal networks, localhost, and private IPs is not allowed.`,
    );
  }

  // Block credentials in URL (username:password@host)
  if (parsed.username || parsed.password) {
    throw new Error(
      `[SSRF Protection] URLs with embedded credentials are not allowed\n  💡 Remove username:password from the URL and use proper authentication headers.`,
    );
  }
}

/**
 * Extract hostname from URL for logging (sanitized)
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove credentials if present
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid URL]';
  }
}

/**
 * Check if a URL is safe without throwing
 *
 * @returns { safe: true } or { safe: false, reason: string }
 */
export function checkUrl(url: string, allowPrivate = false): { safe: true } | { safe: false; reason: string } {
  try {
    validateUrl(url, allowPrivate);
    return { safe: true };
  } catch (err) {
    return {
      safe: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
