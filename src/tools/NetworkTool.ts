import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as dns from 'node:dns/promises';
import { createWriteStream } from 'node:fs';
import { isIPv4 } from 'node:net';
import axios, { AxiosRequestConfig, Method } from 'axios';
import FormData from 'form-data';
import { resolveSafePath } from './shared.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

// 设置 axios 默认超时，防止请求卡住
axios.defaults.timeout = 30000;

// ── SSRF / URL validation ────────────────────────────────────────

/** Private / loopback / dangerous IP ranges (for IPv4) */
const DANGEROUS_IPV4_RANGES = [
  { prefix: '10.', mask: 8 }, // 10.0.0.0/8
  { prefix: '172.16.', mask: 12 }, // 172.16.0.0/12
  { prefix: '192.168.', mask: 16 }, // 192.168.0.0/16
  { prefix: '127.', mask: 8 }, // 127.0.0.0/8 loopback
  { prefix: '169.254.', mask: 16 }, // 169.254.0.0/16 link-local
  { prefix: '0.', mask: 8 }, // 0.0.0.0/8
];

/** Dangerous IPv6 ranges */
const DANGEROUS_IPV6_PREFIXES = [
  '::1', // loopback
  'fc00:', // unique local
  'fd00:', // unique local
  'fe80:', // link-local
  'ff00:', // multicast
];

/** Block dangerous URL schemes */
const BLOCKED_SCHEMES = new Set(['file', 'ftp', 'telnet', 'gopher', 'dict', 'ssh', 'git']);

/** Convert IPv4 dotted string to a 32-bit number for prefix matching. */
function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0);
}

/** Check if an IPv4 address falls within a CIDR range (prefix/length). */
function isInRange(ip: string, prefix: string, maskLen: number): boolean {
  const ipNum = ipv4ToNumber(ip);
  const prefixNum = ipv4ToNumber(prefix);
  const mask = ~0 << (32 - maskLen);
  return (ipNum & mask) === (prefixNum & mask);
}

/** Check if an IPv4 address is private/loopback/link-local. */
function isDangerousIPv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  for (const range of DANGEROUS_IPV4_RANGES) {
    if (isInRange(ip, range.prefix, range.mask)) return true;
  }
  return false;
}

/** Check if an IPv6 address is dangerous. */
function isDangerousIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  for (const prefix of DANGEROUS_IPV6_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * 将 hostname DNS 解析为 IP，并检查是否指向内网。
 * 此函数是 SSRF 防护的核心：对域名做 DNS 解析后检查 IP，
 * 防止攻击者用外部域名指向内网 IP 绕过主机名校验。
 */
async function resolveAndCheckHostname(host: string): Promise<string | null> {
  // IP 字面量已经在 validateUrl 中拦截——这里只处理域名
  if (isIPv4(host) || host.startsWith('[') || host === '::1') return null;

  // 已知的危险域名快速检查（免 DNS 查询）
  const dangerousHosts = new Set([
    'localhost',
    'metadata.google.internal',
    'metadata.internal',
    '100.100.100.200', // 阿里云 metadata
  ]);
  if (dangerousHosts.has(host)) {
    return 'Access to internal services is not allowed';
  }

  // 如果 host 看起来是裸 IP（但没被 isIPv4 捕获——极少边缘情况），拒绝
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return 'Accessing IP addresses directly is not allowed';
  }

  // DNS 解析：先尝试 A 记录（IPv4），再尝试 AAAA 记录（IPv6）
  const addresses: string[] = [];
  try {
    const v4Result = await dns.resolve4(host, { ttl: false });
    addresses.push(...v4Result.map((r) => (typeof r === 'string' ? r : r.address)));
  } catch {
    // A 记录解析失败是正常的（可能只有 AAAA）
  }
  try {
    const v6Result = await dns.resolve6(host, { ttl: false });
    addresses.push(...v6Result.map((r) => (typeof r === 'string' ? r : r.address)));
  } catch {
    // 可能只有 A 记录
  }

  if (addresses.length === 0) {
    // DNS 解析完全失败——域名不存在或网络问题
    return `DNS resolution failed for "${host}" — cannot verify destination.`;
  }

  // 逐一检查每个解析到的 IP
  for (const addr of addresses) {
    if (isIPv4(addr) && isDangerousIPv4(addr)) {
      return `DNS resolved "${host}" to private IP ${addr} — access denied.`;
    }
    if (!isIPv4(addr) && isDangerousIPv6(addr)) {
      return `DNS resolved "${host}" to private IP ${addr} — access denied.`;
    }
  }

  return null; // 安全
}

/**
 * 综合 URL 安全校验：
 * 1. 协议白名单
 * 2. IP 字面量直接拦截
 * 3. 危险主机名快速拦截（免 DNS）
 * 4. DNS 解析后检查 IP 是否落入内网范围
 */
export async function validateUrl(url: string): Promise<string | null> {
  if (url.length > MAX_URL_LENGTH) {
    return `URL too long (${url.length} chars, max ${MAX_URL_LENGTH})`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  // Block dangerous schemes
  if (BLOCKED_SCHEMES.has(parsed.protocol.replace(':', '').toLowerCase())) {
    return `Scheme '${parsed.protocol}' is not allowed`;
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Only http and https schemes are allowed, got '${parsed.protocol}'`;
  }

  const host = parsed.hostname.toLowerCase();

  // Block direct IP literals (IPv4 and IPv6)
  if (isIPv4(host)) {
    return 'Accessing IP addresses directly is not allowed';
  }
  if (host.startsWith('[') || host === '::1') {
    return 'Accessing IP addresses directly is not allowed';
  }

  // DNS 解析检查（异步）
  const dnsError = await resolveAndCheckHostname(host);
  if (dnsError) return dnsError;

  return null;
}

/**
 * Verify DNS resolution before making the actual request (DNS rebinding protection).
 * This double-checks the hostname still resolves to safe IPs at request time.
 */
async function verifyDnsBeforeRequest(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  const host = parsed.hostname.toLowerCase();

  // Re-validate DNS to prevent rebinding attacks
  const dnsError = await resolveAndCheckHostname(host);
  if (dnsError) {
    return `DNS rebinding detected: ${dnsError}`;
  }

  return null;
}

/**
 * URL 安全校验 + DNS 抗绑定检查的组合装饰器。
 * 替代所有网络函数中重复的 validateUrl + verifyDnsBeforeRequest 调用。
 */
async function validateUrlWithDnsCheck(url: string): Promise<string | null> {
  const urlErr = await validateUrl(url);
  if (urlErr) return urlErr;
  return verifyDnsBeforeRequest(url);
}

// ── Network tools ─────────────────────────────────────────────────

const MAX_DOWNLOAD_SIZE = 500 * 1024 * 1024; // 500 MB limit for downloads
const MAX_URL_LENGTH = 8192; // 防止超长URL攻击
const MAX_REDIRECTS = 10; // 限制重定向次数
const USER_AGENT = 'CodeYang-Agent/0.7.0';

export async function executeHttpRequest(
  url: string,
  method: Method = 'GET',
  headers?: Record<string, string>,
  body?: unknown,
  timeout = 30000,
): Promise<string> {
  checkRateLimit('network');

  if (url.length > MAX_URL_LENGTH) {
    return `Error: URL too long (${url.length} chars, max ${MAX_URL_LENGTH})`;
  }

  const urlErr = await validateUrlWithDnsCheck(url);
  if (urlErr) return `Error: ${urlErr}`;

  try {
    const config: AxiosRequestConfig = {
      method,
      url,
      headers: { 'User-Agent': USER_AGENT, ...headers },
      timeout,
      maxRedirects: MAX_REDIRECTS,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = body;
    }

    const response = await axios(config);

    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
    };

    return JSON.stringify(result, null, 2);
  } catch (err) {
    const axiosErr = err as {
      response?: { status: number; statusText: string; data: unknown };
      message?: string;
      code?: string;
    };
    if (axiosErr.code === 'ECONNABORTED') {
      return `Error: Request timed out after ${timeout}ms`;
    }
    if (axiosErr.response) {
      return JSON.stringify(
        {
          error: 'HTTP Error',
          status: axiosErr.response.status,
          statusText: axiosErr.response.statusText,
          data: axiosErr.response.data,
        },
        null,
        2,
      );
    }
    const msg = axiosErr.message || String(err);
    return `Error: ${msg}`;
  }
}

/**
 * Download file from URL to local path
 */
export async function executeDownloadFile(url: string, destPath: string, timeout = 60000): Promise<string> {
  checkRateLimit('network');

  const urlErr = await validateUrlWithDnsCheck(url);
  if (urlErr) return `Error: ${urlErr}`;

  try {
    const absPath = resolveSafePath(destPath);
    const dir = path.dirname(absPath);

    await fs.mkdir(dir, { recursive: true });

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout,
      maxContentLength: MAX_DOWNLOAD_SIZE,
      maxBodyLength: MAX_DOWNLOAD_SIZE,
    });

    // Check Content-Length header if available
    const contentLengthHeader = response.headers['content-length'];
    const contentLength = parseInt(String(contentLengthHeader || '0'), 10);
    if (contentLength > MAX_DOWNLOAD_SIZE) {
      return `Error: File size ${(contentLength / 1024 / 1024).toFixed(1)} MB exceeds maximum ${MAX_DOWNLOAD_SIZE / 1024 / 1024} MB`;
    }

    const writer = createWriteStream(absPath);
    let downloadedBytes = 0;

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes > MAX_DOWNLOAD_SIZE) {
        writer.destroy();
        response.data.destroy();
        throw new Error(`Download exceeded size limit of ${MAX_DOWNLOAD_SIZE / 1024 / 1024} MB`);
      }
    });

    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });

    const stats = await fs.stat(absPath);

    return `Downloaded: ${url}\nSaved to: ${absPath}\nSize: ${stats.size} bytes`;
  } catch (err) {
    const axiosErr = err as { message?: string };
    const msg = axiosErr.message || String(err);
    return `Error downloading file: ${msg}`;
  }
}

/**
 * Upload file to server via multipart/form-data
 */
export async function executeUploadFile(
  url: string,
  filePath: string,
  fieldName = 'file',
  additionalFields?: Record<string, string>,
  timeout = 60000,
): Promise<string> {
  const urlErr = await validateUrlWithDnsCheck(url);
  if (urlErr) return `Error: ${urlErr}`;

  try {
    const absPath = resolveSafePath(filePath);

    const form = new FormData();
    form.append(fieldName, await fs.readFile(absPath), path.basename(absPath));

    if (additionalFields) {
      Object.entries(additionalFields).forEach(([key, value]) => {
        form.append(key, value);
      });
    }

    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout,
    });

    return JSON.stringify(
      {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
      },
      null,
      2,
    );
  } catch (err) {
    const axiosErr = err as {
      response?: { status: number; statusText: string; data: unknown };
      message?: string;
      code?: string;
    };
    if (axiosErr.code === 'ECONNABORTED') {
      return `Error: Request timed out after ${timeout}ms`;
    }
    if (axiosErr.response) {
      return JSON.stringify(
        {
          error: 'Upload Error',
          status: axiosErr.response.status,
          statusText: axiosErr.response.statusText,
          data: axiosErr.response.data,
        },
        null,
        2,
      );
    }
    const msg = axiosErr.message || String(err);
    return `Error uploading file: ${msg}`;
  }
}

/**
 * Call RESTful API with JSON body and parse response
 */
export async function executeApiCall(
  url: string,
  method: Method = 'GET',
  body?: unknown,
  headers?: Record<string, string>,
  timeout = 30000,
): Promise<string> {
  const urlErr = await validateUrlWithDnsCheck(url);
  if (urlErr) return `Error: ${urlErr}`;

  try {
    const config: AxiosRequestConfig = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = body;
    }

    const response = await axios(config);

    return JSON.stringify(
      {
        success: true,
        status: response.status,
        data: response.data,
      },
      null,
      2,
    );
  } catch (err) {
    const axiosErr = err as { response?: { status: number; data: unknown }; message?: string };
    if (axiosErr.response) {
      return JSON.stringify(
        {
          success: false,
          status: axiosErr.response.status,
          error: axiosErr.response.data,
        },
        null,
        2,
      );
    }
    const msg = axiosErr.message || String(err);
    return JSON.stringify(
      {
        success: false,
        error: msg,
      },
      null,
      2,
    );
  }
}

/**
 * Check if URL is accessible and return status info
 */
export async function executeCheckUrl(url: string, timeout = 10000): Promise<string> {
  const urlErr = await validateUrl(url);
  if (urlErr) return `Error: ${urlErr}`;

  // DNS rebinding protection
  const rebindErr = await verifyDnsBeforeRequest(url);
  if (rebindErr) return `Error: ${rebindErr}`;

  try {
    const startTime = Date.now();
    const response = await axios.head(url, {
      timeout,
      validateStatus: () => true,
    });
    const responseTime = Date.now() - startTime;

    return [
      `URL: ${url}`,
      `Status: ${response.status} ${response.statusText}`,
      `Response Time: ${responseTime}ms`,
      `Content-Type: ${response.headers['content-type'] || 'N/A'}`,
      `Content-Length: ${response.headers['content-length'] || 'N/A'}`,
      `Server: ${response.headers['server'] || 'N/A'}`,
      `Accessible: ${response.status >= 200 && response.status < 400 ? 'Yes' : 'No'}`,
    ].join('\n');
  } catch (err) {
    const axiosErr = err as { message?: string };
    const msg = axiosErr.message || String(err);
    return `URL check failed: ${msg}`;
  }
}

/**
 * Parse URL and extract components
 */
export function executeParseUrl(urlString: string): string {
  try {
    const url = new URL(urlString);

    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return [
      `URL: ${urlString}`,
      ``,
      `Protocol: ${url.protocol}`,
      `Host: ${url.hostname}`,
      `Port: ${url.port || 'default'}`,
      `Pathname: ${url.pathname}`,
      `Search: ${url.search || 'none'}`,
      `Hash: ${url.hash || 'none'}`,
      ``,
      `Query Parameters: ${Object.keys(params).length}`,
      ...Object.entries(params).map(([key, value]) => `  - ${key}: ${value}`),
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error parsing URL: ${msg}`;
  }
}
