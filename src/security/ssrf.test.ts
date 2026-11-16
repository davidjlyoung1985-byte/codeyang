import { describe, it, expect } from 'vitest';
import { validateUrl, checkUrl, sanitizeUrlForLogging } from './ssrf.js';

describe('SSRF Protection', () => {
  describe('validateUrl', () => {
    it('should allow safe public URLs', () => {
      expect(() => validateUrl('https://example.com')).not.toThrow();
      expect(() => validateUrl('http://google.com')).not.toThrow();
      expect(() => validateUrl('https://api.github.com/repos')).not.toThrow();
    });

    it('should block localhost', () => {
      expect(() => validateUrl('http://localhost:8080')).toThrow(/private network/i);
      expect(() => validateUrl('http://127.0.0.1')).toThrow(/private network/i);
      expect(() => validateUrl('http://127.0.0.1:3000')).toThrow(/private network/i);
    });

    it('should block private IP ranges', () => {
      expect(() => validateUrl('http://10.0.0.1')).toThrow(/private network/i);
      expect(() => validateUrl('http://192.168.1.1')).toThrow(/private network/i);
      expect(() => validateUrl('http://172.16.0.1')).toThrow(/private network/i);
    });

    it('should block cloud metadata endpoints', () => {
      expect(() => validateUrl('http://169.254.169.254/latest/meta-data')).toThrow(/metadata/i);
      expect(() => validateUrl('http://metadata.google.internal')).toThrow(/metadata/i);
      expect(() => validateUrl('http://169.254.170.2/v2/metadata')).toThrow(/metadata/i);
    });

    it('should block invalid protocols', () => {
      expect(() => validateUrl('file:///etc/passwd')).toThrow(/protocol/i);
      expect(() => validateUrl('ftp://example.com')).toThrow(/protocol/i);
      expect(() => validateUrl('javascript:alert(1)')).toThrow(/protocol/i);
    });

    it('should block credentials in URL', () => {
      expect(() => validateUrl('http://user:pass@example.com')).toThrow(/credentials/i);
    });

    it('should allow private IPs when explicitly enabled', () => {
      expect(() => validateUrl('http://192.168.1.1', true)).not.toThrow();
      expect(() => validateUrl('http://localhost', true)).not.toThrow();
    });

    it('should reject invalid URLs', () => {
      expect(() => validateUrl('not a url')).toThrow(/invalid url/i);
      expect(() => validateUrl('')).toThrow(/invalid url/i);
    });

    // ── Regression: IPv6 literal handling ──
    //
    // Node's URL parser returns IPv6 hosts *with* brackets ("[::1]"), but the
    // original patterns were written as /^::1$/, /^::ffff:/, /^fe80:/ etc. and
    // therefore could never match. Every one of these URLs used to be allowed.
    describe('regression: IPv6 literals are blocked', () => {
      it.each([
        'http://[::1]/',
        'http://[::1]:8080/',
        'http://[0:0:0:0:0:0:0:1]/',
        'http://[::]/',
        'http://[fe80::1]/',
        'http://[fc00::1]/',
        'http://[fd00::1]/',
        'http://[ff02::1]/',
      ])('blocks %s', (url) => {
        expect(() => validateUrl(url)).toThrow(/private network/i);
      });

      it.each([
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:7f00:1]/',
        'http://[::ffff:192.168.1.1]/',
        'http://[::ffff:a00:1]/',
      ])('blocks IPv4-mapped IPv6 %s', (url) => {
        expect(() => validateUrl(url)).toThrow(/private network/i);
      });

      it('blocks IPv4-mapped metadata address', () => {
        expect(() => validateUrl('http://[::ffff:169.254.169.254]/latest/meta-data')).toThrow(/metadata|private/i);
      });

      it('still allows public IPv6 literals', () => {
        expect(() => validateUrl('http://[2606:4700:4700::1111]/')).not.toThrow();
      });
    });

    // ── Regression: integer / shorthand IPv4 notation ──
    //
    // WHATWG URL normalises these to dotted decimal, so they were already safe;
    // this pins the behaviour so a future parser change cannot silently reopen
    // the hole.
    it.each(['http://2130706433/', 'http://0x7f000001/', 'http://127.1/', 'http://0/'])(
      'blocks normalised shorthand notation %s',
      (url) => {
        expect(() => validateUrl(url)).toThrow(/private network/i);
      },
    );
  });

  describe('checkUrl', () => {
    it('should return safe: true for valid URLs', () => {
      expect(checkUrl('https://example.com')).toEqual({ safe: true });
    });

    it('should return safe: false with reason for invalid URLs', () => {
      const result = checkUrl('http://localhost');
      expect(result.safe).toBe(false);
      if (!result.safe) {
        expect(result.reason).toContain('private network');
      }
    });
  });

  describe('sanitizeUrlForLogging', () => {
    it('should remove credentials from URL', () => {
      const sanitized = sanitizeUrlForLogging('http://user:pass@example.com/path');
      expect(sanitized).not.toContain('user');
      expect(sanitized).not.toContain('pass');
      expect(sanitized).toContain('example.com');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(sanitizeUrlForLogging('not a url')).toBe('[invalid URL]');
    });

    it('should preserve path and host', () => {
      const sanitized = sanitizeUrlForLogging('https://api.example.com/v1/users');
      expect(sanitized).toContain('api.example.com');
      expect(sanitized).toContain('/v1/users');
    });
  });
});
