import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import {
  executeHttpRequest,
  executeDownloadFile,
  executeUploadFile,
  executeApiCall,
  executeCheckUrl,
  executeParseUrl,
} from './NetworkTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-network');

describe('NetworkTool', () => {
  beforeEach(async () => {
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

  describe('executeHttpRequest', () => {
    it('should make GET request', async () => {
      const result = await executeHttpRequest(
        'https://httpbin.org/get',
        'GET',
      );

      expect(result).toContain('"status": 200');
      expect(result).toContain('"data"');
    });

    it('should make POST request with body', async () => {
      const body = { name: 'test', value: 123 };
      const result = await executeHttpRequest(
        'https://httpbin.org/post',
        'POST',
        { 'Content-Type': 'application/json' },
        body,
      );

      expect(result).toContain('"status": 200');
      expect(result).toContain('test');
    });

    it('should handle request timeout', async () => {
      const result = await executeHttpRequest(
        'https://httpbin.org/delay/10',
        'GET',
        undefined,
        undefined,
        100,
      );

      expect(result).toContain('Error');
    });

    it('should handle 404 errors', async () => {
      const result = await executeHttpRequest(
        'https://httpbin.org/status/404',
        'GET',
      );

      expect(result).toContain('"status": 404');
    });
  });

  describe('executeDownloadFile', () => {
    it('should download file', async () => {
      const destPath = path.join(TEST_DIR, 'downloaded.json');
      const result = await executeDownloadFile(
        'https://httpbin.org/json',
        destPath,
      );

      expect(result).toContain('Downloaded');
      expect(result).toContain('Size:');
      expect(existsSync(destPath)).toBe(true);
    });

    it('should create parent directories', async () => {
      const destPath = path.join(TEST_DIR, 'sub', 'dir', 'file.json');
      const result = await executeDownloadFile(
        'https://httpbin.org/json',
        destPath,
      );

      expect(result).toContain('Downloaded');
      expect(existsSync(destPath)).toBe(true);
    });

    it('should handle download errors', async () => {
      const destPath = path.join(TEST_DIR, 'error.txt');
      const result = await executeDownloadFile(
        'https://invalid-url-that-does-not-exist.com/file',
        destPath,
        1000,
      );

      expect(result).toContain('Error');
    });
  });

  describe('executeUploadFile', () => {
    it('should upload file', async () => {
      const testFile = path.join(TEST_DIR, 'upload.txt');
      await fs.writeFile(testFile, 'test content');

      const result = await executeUploadFile(
        'https://httpbin.org/post',
        testFile,
      );

      expect(result).toContain('"status": 200');
    });

    it('should upload with additional fields', async () => {
      const testFile = path.join(TEST_DIR, 'upload.txt');
      await fs.writeFile(testFile, 'test content');

      const result = await executeUploadFile(
        'https://httpbin.org/post',
        testFile,
        'file',
        { description: 'test file', version: '1.0' },
      );

      expect(result).toContain('"status": 200');
      expect(result).toContain('description');
    });

    it('should handle upload errors', async () => {
      const result = await executeUploadFile(
        'https://httpbin.org/post',
        'nonexistent-file.txt',
      );

      expect(result).toContain('Error');
    });
  });

  describe('executeApiCall', () => {
    it('should make successful API call', async () => {
      const result = await executeApiCall(
        'https://httpbin.org/get',
        'GET',
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe(200);
    });

    it('should POST JSON data', async () => {
      const body = { user: 'john', age: 30 };
      const result = await executeApiCall(
        'https://httpbin.org/post',
        'POST',
        body,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe(200);
    });

    it('should handle API errors', async () => {
      const result = await executeApiCall(
        'https://httpbin.org/status/500',
        'GET',
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.status).toBe(500);
    });

    it('should include custom headers', async () => {
      const result = await executeApiCall(
        'https://httpbin.org/headers',
        'GET',
        undefined,
        { 'X-Custom-Header': 'test-value' },
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('executeCheckUrl', () => {
    it('should check accessible URL', async () => {
      const result = await executeCheckUrl('https://httpbin.org/');

      expect(result).toContain('Status: 200');
      expect(result).toContain('Accessible: Yes');
      expect(result).toContain('Response Time:');
    });

    it('should check inaccessible URL', async () => {
      const result = await executeCheckUrl('https://httpbin.org/status/404');

      expect(result).toContain('Status: 404');
      expect(result).toContain('Accessible: No');
    });

    it('should handle connection errors', async () => {
      const result = await executeCheckUrl(
        'https://invalid-domain-12345.com',
        1000,
      );

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
