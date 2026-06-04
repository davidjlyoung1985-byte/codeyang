import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createWriteStream } from 'node:fs';
import axios, { AxiosRequestConfig, Method } from 'axios';
import FormData from 'form-data';

/**
 * Send HTTP request with configurable method, headers, and body
 */
export async function executeHttpRequest(
  url: string,
  method: Method = 'GET',
  headers?: Record<string, string>,
  body?: any,
  timeout = 30000,
): Promise<string> {
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
  } catch (err: any) {
    if (err.response) {
      return JSON.stringify({
        error: 'HTTP Error',
        status: err.response.status,
        statusText: err.response.statusText,
        data: err.response.data,
      }, null, 2);
    }
    const msg = err.message || String(err);
    return `Error: ${msg}`;
  }
}

/**
 * Download file from URL to local path
 */
export async function executeDownloadFile(
  url: string,
  destPath: string,
  timeout = 60000,
): Promise<string> {
  try {
    const absPath = path.resolve(destPath);
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
  } catch (err: any) {
    const msg = err.message || String(err);
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
  try {
    const absPath = path.resolve(filePath);

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

    return JSON.stringify({
      status: response.status,
      statusText: response.statusText,
      data: response.data,
    }, null, 2);
  } catch (err: any) {
    if (err.response) {
      return JSON.stringify({
        error: 'Upload Error',
        status: err.response.status,
        statusText: err.response.statusText,
        data: err.response.data,
      }, null, 2);
    }
    const msg = err.message || String(err);
    return `Error uploading file: ${msg}`;
  }
}

/**
 * Call RESTful API with JSON body and parse response
 */
export async function executeApiCall(
  url: string,
  method: Method = 'GET',
  body?: any,
  headers?: Record<string, string>,
  timeout = 30000,
): Promise<string> {
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

    return JSON.stringify({
      success: true,
      status: response.status,
      data: response.data,
    }, null, 2);
  } catch (err: any) {
    if (err.response) {
      return JSON.stringify({
        success: false,
        status: err.response.status,
        error: err.response.data,
      }, null, 2);
    }
    const msg = err.message || String(err);
    return JSON.stringify({
      success: false,
      error: msg,
    }, null, 2);
  }
}

/**
 * Check if URL is accessible and return status info
 */
export async function executeCheckUrl(
  url: string,
  timeout = 10000,
): Promise<string> {
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
  } catch (err: any) {
    const msg = err.message || String(err);
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
  } catch (err: any) {
    const msg = err.message || String(err);
    return `Error parsing URL: ${msg}`;
  }
}
