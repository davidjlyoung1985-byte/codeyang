/**
 * SSRF (Server-Side Request Forgery) Protection
 *
 * Validates URLs to prevent access to internal networks, cloud metadata endpoints,
 * and other sensitive resources that could lead to security vulnerabilities.
 *
 * ── SINGLE SOURCE OF TRUTH ──
 * This module owns the IP-classification logic. `tools/NetworkTool.ts` imports
 * `isPrivateIP` from here rather than keeping its own copy: the two used to
 * diverge, and NetworkTool's version had the same IPv6 prefix bug this file had.
 * If you need a new range, add it here.
 */

// No external dependencies - standalone security module

/**
 * Private IP ranges (RFC 1918, RFC 4193, and others)
 *
 * IPv6 note: `new URL(...).hostname` returns IPv6 literals *with* square
 * brackets (`"[::1]"`, `"[::ffff:7f00:1]"`). The earlier patterns
 * (`/^::1$/`, `/^::ffff:/`, `/^fe80:/`) were written without brackets, so none
 * of them could ever match and every IPv6 loopback/private address was allowed
 * through. The IPv6 checks below strip the brackets first.
 */
const PRIVATE_IP_PATTERNS = [
  // IPv4 private ranges
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
  /^192\.168\./, // Class C private
  /^169\.254\./, // Link-local (AWS metadata)
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT / RFC 6598
  /^0\./, // "This network" — 0.0.0.0/8 (0.0.0.0 is unspecified)
  /^255\.255\.255\.255$/, // Broadcast
];

/**
 * IPv6 prefixes that must never be reachable. Matched against the *normalised*
 * address (brackets removed, lowercased).
 *
 * These are CIDR blocks, not literal strings: `fc00::/7` covers fc00:–fdff:,
 * `ff00::/8` covers every multicast address (ff02::1 included), so the prefix
 * has to be shortened to the block boundary. Writing `'fd00:'` would only ever
 * match an address that literally starts with `fd00:`.
 */
const PRIVATE_IPV6_PREFIXES = [
  '::1', // Loopback
  '::', // Unspecified
  'fe80:', // Link-local fe80::/10 (fe80:–febf:)
  'fe80', // …covers the unbracketed hextet form too
  'fec0:', // Site-local (deprecated but still routable on some stacks)
  'fc', // Unique local fc00::/7 (fc00:–fdff:)
  'fd', // Unique local (same block, kept explicit for readability)
  'ff', // Multicast ff00::/8
];

/** IPv6 forms that embed an IPv4 address, which must be unwrapped and re-checked. */
const IPV6_MAPPED_PREFIXES = ['::ffff:', '::ffff:0:', '64:ff9b::', '2002:'];

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
 * Strip the square brackets Node's URL parser wraps around IPv6 literals.
 * `new URL('http://[::1]/').hostname` is `"[::1]"`, not `"::1"`.
 */
function normalizeHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
}

/**
 * Check if a hostname resolves to a private IP address
 */
export function isPrivateIP(hostname: string): boolean {
  const host = normalizeHost(hostname);

  // Direct IPv4 check
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(host)) {
      return true;
    }
  }

  // Direct IPv6 check — brackets already stripped.
  // Only apply the short CIDR prefixes to actual IPv6 literals: a bare
  // `startsWith('fc')` would otherwise flag hostnames like "fcbank.com".
  const isIpv6Literal = hostname.trim().startsWith('[') || host.includes(':');
  if (isIpv6Literal) {
    for (const prefix of PRIVATE_IPV6_PREFIXES) {
      if (host === prefix || host.startsWith(prefix)) {
        return true;
      }
    }
  }

  // IPv4-embedded IPv6 (::ffff:127.0.0.1, 64:ff9b::a00:1, 2002::/16 6to4):
  // unwrap the IPv4 tail and re-check it against the IPv4 rules, otherwise
  // `http://[::ffff:127.0.0.1]/` walks straight to loopback.
  for (const prefix of IPV6_MAPPED_PREFIXES) {
    if (!host.startsWith(prefix)) continue;
    const tail = host.slice(prefix.length);

    // Dotted form: ::ffff:127.0.0.1
    if (isPrivateIP(tail)) return true;

    // Hextet form: ::ffff:7f00:1 -> 127.0.0.1
    const asIpv4 = hextetsToIpv4(tail);
    if (asIpv4 && isPrivateIP(asIpv4)) return true;
  }

  // Check against blocked hostnames
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (host === blocked || host.endsWith('.' + blocked)) {
      return true;
    }
  }

  return false;
}

/**
 * Convert the last two hextets of an IPv4-mapped IPv6 address to dotted form.
 * `"7f00:1"` -> `"127.0.0.1"`. Returns null when the input is not shaped like that.
 */
function hextetsToIpv4(input: string): string | null {
  const parts = input.split(':').filter(Boolean);
  if (parts.length < 2) return null;
  const [hi, lo] = parts.slice(-2);
  if (!/^[0-9a-f]{1,4}$/.test(hi) || !/^[0-9a-f]{1,4}$/.test(lo)) return null;
  const n = (parseInt(hi, 16) << 16) | parseInt(lo, 16);
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
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

  // Block cloud metadata endpoints (always dangerous).
  // Check the normalised host too: `http://[::ffff:169.254.169.254]/` reaches
  // the AWS metadata service but the raw URL string never contains
  // "169.254.169.254" as a contiguous substring.
  const normalized = normalizeHost(hostname);
  if (
    isCloudMetadataEndpoint(url) ||
    isCloudMetadataEndpoint(hostname) ||
    isCloudMetadataEndpoint(normalized) ||
    CLOUD_METADATA_PATTERNS.some((p) => p.test(hextetsToIpv4(normalized) ?? ''))
  ) {
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
