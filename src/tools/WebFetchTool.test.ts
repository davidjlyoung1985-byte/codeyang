import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { executeWebFetch } from './WebFetchTool.js';

describe('WebFetchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should fetch URL successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: null,
        text: async () => 'Hello World',
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toBe('Hello World');
    });

    it('should fetch HTML and convert to text', async () => {
      const html = '<html><body><h1>Title</h1><p>Content</p></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toContain('Title');
      expect(result).toContain('Content');
      expect(result).not.toContain('<html>');
    });

    it('should return raw HTML when format is html', async () => {
      const html = '<html><body><h1>Title</h1></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com', 'html');

      expect(result).toBe(html);
    });
  });

  describe('URL validation', () => {
    it('should reject empty URL', async () => {
      await expect(executeWebFetch('')).rejects.toThrow();
    });

    it('should reject non-string URL', async () => {
      await expect(executeWebFetch(null as unknown as string)).rejects.toThrow();
    });

    it('should reject invalid URL', async () => {
      await expect(executeWebFetch('not-a-url')).rejects.toThrow('Invalid URL');
    });

    it('should reject non-HTTP protocols', async () => {
      await expect(executeWebFetch('ftp://example.com')).rejects.toThrow('Invalid URL');
      await expect(executeWebFetch('file:///etc/passwd')).rejects.toThrow('Invalid URL');
    });

    it('should accept http and https', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: null,
        text: async () => 'OK',
      });

      await expect(executeWebFetch('http://example.com')).resolves.toBe('OK');
      await expect(executeWebFetch('https://example.com')).resolves.toBe('OK');
    });
  });

  describe('HTTP status handling', () => {
    it('should handle 404 errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
      });

      await expect(executeWebFetch('https://example.com/404')).rejects.toThrow('HTTP 404');
    });

    it('should handle 500 errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
      });

      await expect(executeWebFetch('https://example.com')).rejects.toThrow('HTTP 500');
    });

    it('should handle 403 forbidden', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Map(),
      });

      await expect(executeWebFetch('https://example.com')).rejects.toThrow('HTTP 403');
    });
  });

  describe('redirect handling', () => {
    it('should follow 301 redirect', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Map([['location', 'https://example.com/new']]),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          body: null,
          text: async () => 'Redirected',
        });

      const result = await executeWebFetch('https://example.com/old');

      expect(result).toBe('Redirected');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should follow 302 redirect', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 302,
          headers: new Map([['location', '/new']]),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          body: null,
          text: async () => 'OK',
        });

      const result = await executeWebFetch('https://example.com/old');

      expect(result).toBe('OK');
    });

    it('should reject too many redirects', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 301,
        headers: new Map([['location', 'https://example.com/loop']]),
      });

      await expect(executeWebFetch('https://example.com/start')).rejects.toThrow('Too many redirects');
    });

    it('should reject redirect without Location header', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 302,
        headers: new Map(),
      });

      await expect(executeWebFetch('https://example.com')).rejects.toThrow('Redirect 302 without Location');
    });
  });

  describe('timeout handling', () => {
    it('should timeout after 15 seconds', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            const error = new Error('Aborted') as Error & { name: string };
            error.name = 'AbortError';
            reject(error);
          }, 100);
        });
      });

      await expect(executeWebFetch('https://slow.example.com')).rejects.toThrow('Request timed out');
    });
  });

  describe('size limits', () => {
    it('should reject response exceeding Content-Length limit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'text/plain'],
          ['content-length', '20000000'], // 20MB
        ]),
        body: null,
        text: async () => 'data',
      });

      await expect(executeWebFetch('https://example.com')).rejects.toThrow('Response too large');
    });

    it('should reject response exceeding size during streaming', async () => {
      const largeChunk = new Uint8Array(11 * 1024 * 1024); // 11MB
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: false, value: largeChunk }).mockResolvedValueOnce({ done: true }),
        cancel: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: { getReader: () => mockReader },
      });

      await expect(executeWebFetch('https://example.com/large')).rejects.toThrow('exceeded maximum size');
    });

    it('should truncate very long text content', async () => {
      const longText = 'a'.repeat(150000);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: null,
        text: async () => longText,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toContain('[Content truncated');
      expect(result.length).toBeLessThan(longText.length);
    });
  });

  describe('HTML processing', () => {
    it('should remove script tags', async () => {
      const html = '<html><body><script>alert("xss")</script><p>Content</p></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).not.toContain('alert');
      expect(result).toContain('Content');
    });

    it('should remove style tags', async () => {
      const html = '<html><body><style>body{color:red}</style><p>Text</p></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).not.toContain('color:red');
      expect(result).toContain('Text');
    });

    it('should extract link URLs', async () => {
      const html = '<html><body><a href="https://link.com">Click here</a></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toContain('Click here');
      expect(result).toContain('https://link.com');
    });

    it('should decode HTML entities', async () => {
      const html = '<html><body>&lt;div&gt;&amp;&quot;&#39;&nbsp;</body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toContain('<div>');
      expect(result).toContain('&');
      expect(result).toContain('"');
      expect(result).toContain("'");
    });

    it('should handle nested tags', async () => {
      const html = '<html><body><div><b><i>Nested</i></b></div></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toContain('Nested');
      expect(result).not.toContain('<b>');
      expect(result).not.toContain('<i>');
    });

    it('should detect HTML without content-type header', async () => {
      const html = '<!DOCTYPE html><html><body>Content</body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).not.toContain('<!DOCTYPE');
      expect(result).toContain('Content');
    });
  });

  describe('edge cases', () => {
    it('should handle empty response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: null,
        text: async () => '',
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toBe('');
    });

    it('should handle response without content-type', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        body: null,
        text: async () => 'Content',
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toBe('Content');
    });

    it('should handle malformed HTML', async () => {
      const html = '<html><body><p>Unclosed paragraph<div>Nested</p></div>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: null,
        text: async () => html,
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toContain('Unclosed paragraph');
      expect(result).toContain('Nested');
    });

    it('should handle special characters in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: null,
        text: async () => 'OK',
      });

      const result = await executeWebFetch('https://example.com/path?param=value&other=123');

      expect(result).toBe('OK');
    });

    it('should handle unicode content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain; charset=utf-8']]),
        body: null,
        text: async () => 'Hello 世界 🌍',
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toContain('世界');
      expect(result).toContain('🌍');
    });

    it('should handle streaming response', async () => {
      const encoder = new TextEncoder();
      const chunks = ['Hello ', 'World'];
      let index = 0;

      const mockReader = {
        read: vi.fn(() => {
          if (index < chunks.length) {
            return Promise.resolve({
              done: false,
              value: encoder.encode(chunks[index++]),
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
        cancel: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: { getReader: () => mockReader },
      });

      const result = await executeWebFetch('https://example.com');

      expect(result).toBe('Hello World');
    });

    it('should handle concurrent fetches', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: null,
        text: async () => 'OK',
      });

      const promises = [
        executeWebFetch('https://example1.com'),
        executeWebFetch('https://example2.com'),
        executeWebFetch('https://example3.com'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r === 'OK')).toBe(true);
    });
  });
});
