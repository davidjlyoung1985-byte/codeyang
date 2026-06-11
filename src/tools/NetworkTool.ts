import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createWriteStream } from 'node:fs';
import axios, { AxiosRequestConfig, Method } from 'axios';
import FormData from 'form-data';
import { resolveSafePath } from './shared.js';

// ── SSRF / URL validation ────────────────────────────────────────

/** Private / loopback / dangerous IP ranges */
const DANGEROUS_SUBNETS = [
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  '127.',
  '169.254.',
  '0.',
  '::1', // IPv6 loopback
  'fc00:', // IPv6 unique local
  'fe80:', // IPv6 link-local
];

/** Block dangerous URL schemes */
const BLOCKED_SCHEMES = new Set(['file', 'ftp', 'telnet', 'gopher', 'dict', 'ssh', 'git']);

/** Return an error string if the URL is unsafe, or null if safe */
function validateUrl(url: string): string | null {
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

  // Block IP literal (direct IP address — blocks both IPv4 and IPv6)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return 'Accessing IP addresses directly is not allowed';
  }
  if (host.startsWith('[')) {
    return 'Accessing IP addresses directly is not allowed';
  }

  // Block loopback / private / link-local / local networks by hostname
  for (const subnet of DANGEROUS_SUBNETS) {
    if (host === subnet.replace('.', '') || host.endsWith('.' + subnet.replace('.', ''))) {
      return 'Access to internal/private networks is not allowed';
    }
  }

  // Block well-known dangerous hostnames
  const dangerousHosts = new Set([
    'localhost',
    'metadata.google.internal',
    'influxdb',
    'redis',
    'mongo',
    'mysql',
    'postgres',
    '127.0.0.1',
    '::1',
  ]);
  if (dangerousHosts.has(host)) {
    return 'Access to internal services is not allowed';
  }

  return null;
}

// ── Network tools ─────────────────────────────────────────────────
export async function executeHttpRequest(
  url: string,
  method: Method = 'GET',
  headers?: Record<string, string>,
  body?: unknown,
  timeout = 30000,
): Promise<string> {
  const urlErr = validateUrl(url);
  if (urlErr) return `Error: ${urlErr}`;
  try {
    const config: AxiosRequestConfig = {
      method,
      url,
      headers,
      timeout,
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
    const axiosErr = err as { response?: { status: number; statusText: string; data: unknown }; message?: string };
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
  const urlErr = validateUrl(url);
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
    });

    const writer = createWriteStream(absPath);

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
  const urlErr = validateUrl(url);
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
    const axiosErr = err as { response?: { status: number; statusText: string; data: unknown }; message?: string };
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
  const urlErr = validateUrl(url);
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
  const urlErr = validateUrl(url);
  if (urlErr) return `Error: ${urlErr}`;
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
