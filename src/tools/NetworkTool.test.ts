import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';

// Mock axios before importing NetworkTool
vi.mock('axios', () => {
  const mockFn = vi.fn();
  mockFn.post = vi.fn();
  mockFn.head = vi.fn();
  return { default: mockFn };
});

import axios from 'axios';
import {
  executeHttpRequest,
  executeDownloadFile,
  executeUploadFile,
  executeApiCall,
  executeCheckUrl,
  executeParseUrl,
} from './NetworkTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-network');
const mockedAxios = axios as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
  head: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
  vi.clearAllMocks();
  if (existsSync(TEST_DIR)) {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }
  await fs.mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  if (existsSync(TEST_DIR)) {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }
});

describe('NetworkTool', () => {
  describe('executeHttpRequest', () => {
    it('should make GET request', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: { url: 'https://example.com/get' },
      });

      const result = await executeHttpRequest('https://example.com/get', 'GET');

      expect(result).toContain('"status": 200');
      expect(result).toContain('"data"');
    });

    it('should make POST request with body', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { json: { name: 'test', value: 123 } },
      });

      const result = await executeHttpRequest(
        'https://example.com/post',
        'POST',
        { 'Content-Type': 'application/json' },
        '{"name":"test","value":123}',
      );

      expect(result).toContain('"status": 200');
      expect(result).toContain('test');
    });

    it('should handle request timeout', async () => {
      mockedAxios.mockRejectedValue(Object.assign(new Error('timeout of 100ms exceeded'), { code: 'ECONNABORTED' }));

      const result = await executeHttpRequest('https://example.com/delay', 'GET', undefined, undefined, 100);

      expect(result).toContain('Error');
    });

    it('should handle 404 errors', async () => {
      const err = Object.assign(new Error('Not Found'), {
        response: { status: 404, statusText: 'Not Found', headers: {}, data: '' },
      });
      mockedAxios.mockRejectedValue(err);

      const result = await executeHttpRequest('https://example.com/status/404', 'GET');

      expect(result).toContain('"status": 404');
    });
  });

  describe('executeDownloadFile', () => {
    it('should download file and write to disk', async () => {
      const readable = Readable.from(['{"slideshow": {}}']);
      mockedAxios.mockResolvedValue({ data: readable, headers: {} });

      const destPath = path.join(TEST_DIR, 'downloaded.json');
      const result = await executeDownloadFile('https://example.com/json', destPath);

      expect(result).toContain('Downloaded');
      expect(result).toContain('Size:');
      expect(existsSync(destPath)).toBe(true);
    });

    it('should create parent directories', async () => {
      const readable = Readable.from(['{}']);
      mockedAxios.mockResolvedValue({ data: readable, headers: {} });

      const destPath = path.join(TEST_DIR, 'sub', 'dir', 'file.json');
      const result = await executeDownloadFile('https://example.com/json', destPath);

      expect(result).toContain('Downloaded');
      expect(existsSync(destPath)).toBe(true);
    });

    it('should handle download errors', async () => {
      mockedAxios.mockRejectedValue(new Error('ENOTFOUND invalid-url'));

      const destPath = path.join(TEST_DIR, 'error.txt');
      const result = await executeDownloadFile('https://invalid-url.com/file', destPath, 1000);

      expect(result).toContain('Error');
    });
  });

  describe('executeUploadFile', () => {
    it('should upload file', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { files: { file: 'test content' } },
      });

      const testFile = path.join(TEST_DIR, 'upload.txt');
      await fs.writeFile(testFile, 'test content');

      const result = await executeUploadFile('https://example.com/post', testFile);

      expect(result).toContain('"status": 200');
    });

    it('should upload with additional fields', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { form: { description: 'test file', version: '1.0' } },
      });

      const testFile = path.join(TEST_DIR, 'upload.txt');
      await fs.writeFile(testFile, 'test content');

      const result = await executeUploadFile('https://example.com/post', testFile, 'file', {
        description: 'test file',
        version: '1.0',
      });

      expect(result).toContain('"status": 200');
      expect(result).toContain('description');
    });

    it('should handle upload errors (file not found)', async () => {
      const result = await executeUploadFile('https://example.com/post', 'nonexistent-file.txt');

      expect(result).toContain('Error');
    });
  });

  describe('executeApiCall', () => {
    it('should make successful API call', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { url: 'https://example.com/get' },
      });

      const result = await executeApiCall('https://example.com/get', 'GET');

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe(200);
    });

    it('should POST JSON data', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { json: { user: 'john', age: 30 } },
      });

      const result = await executeApiCall('https://example.com/post', 'POST', { user: 'john', age: 30 });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe(200);
    });

    it('should handle API errors', async () => {
      const err = Object.assign(new Error('Internal Server Error'), {
        response: { status: 500, statusText: 'Internal Server Error', headers: {}, data: '' },
      });
      mockedAxios.mockRejectedValue(err);

      const result = await executeApiCall('https://example.com/status/500', 'GET');

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.status).toBe(500);
    });

    it('should include custom headers', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { headers: { 'X-Custom-Header': 'test-value' } },
      });

      const result = await executeApiCall('https://example.com/headers', 'GET', undefined, {
        'X-Custom-Header': 'test-value',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('executeCheckUrl', () => {
    it('should check accessible URL', async () => {
      mockedAxios.head.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html', server: 'nginx' },
      });

      const result = await executeCheckUrl('https://example.com/');

      expect(result).toContain('Status: 200');
      expect(result).toContain('Accessible: Yes');
      expect(result).toContain('Response Time:');
    });

    it('should check inaccessible URL (404)', async () => {
      // validateStatus: () => true means 404 resolves, not rejects
      mockedAxios.head.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        headers: {},
      });

      const result = await executeCheckUrl('https://example.com/missing');

      expect(result).toContain('Status: 404');
      expect(result).toContain('Accessible: No');
    });

    it('should handle connection errors', async () => {
      mockedAxios.head.mockRejectedValue(new Error('ENOTFOUND invalid-domain-12345.com'));

      const result = await executeCheckUrl('https://invalid-domain-12345.com', 1000);

      expect(result).toContain('URL check failed');
    });
  });

  describe('executeParseUrl', () => {
    it('should parse simple URL', () => {
      const result = executeParseUrl('https://example.com/path');

      expect(result).toContain('Protocol: https:');
      expect(result).toContain('Host: example.com');
      expect(result).toContain('Pathname: /path');
    });

    it('should parse URL with query parameters', () => {
      const result = executeParseUrl('https://api.example.com/search?q=test&page=2');

      expect(result).toContain('Protocol: https:');
      expect(result).toContain('Host: api.example.com');
      expect(result).toContain('Pathname: /search');
      expect(result).toContain('Query Parameters: 2');
      expect(result).toContain('q: test');
      expect(result).toContain('page: 2');
    });

    it('should parse URL with port and hash', () => {
      const result = executeParseUrl('http://localhost:3000/page#section');

      expect(result).toContain('Protocol: http:');
      expect(result).toContain('Host: localhost');
      expect(result).toContain('Port: 3000');
      expect(result).toContain('Hash: #section');
    });

    it('should handle invalid URL', () => {
      const result = executeParseUrl('not-a-valid-url');

      expect(result).toContain('Error parsing URL');
    });
  });
});
