import { describe, it, expect } from 'vitest';
import { globToRegex } from './globMatch.js';

function globMatch(pattern: string, path: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(path);
}

describe('globMatch', () => {
  describe('exact matches', () => {
    it('should match exact strings', () => {
      expect(globMatch('file.txt', 'file.txt')).toBe(true);
      expect(globMatch('file.txt', 'other.txt')).toBe(false);
    });
  });

  describe('wildcard patterns', () => {
    it('should match * wildcard', () => {
      expect(globMatch('*.txt', 'file.txt')).toBe(true);
      expect(globMatch('*.txt', 'file.md')).toBe(false);
      expect(globMatch('file.*', 'file.txt')).toBe(true);
      expect(globMatch('file.*', 'file.md')).toBe(true);
    });

    it('should match ** glob pattern', () => {
      expect(globMatch('**/*.txt', 'dir/file.txt')).toBe(true);
      expect(globMatch('**/*.txt', 'dir/sub/file.txt')).toBe(true);
      expect(globMatch('src/**/*.ts', 'src/utils/helper.ts')).toBe(true);
      expect(globMatch('src/**/*.ts', 'src/tools/deep/nested/file.ts')).toBe(true);
    });

    it('should match ? wildcard', () => {
      expect(globMatch('file?.txt', 'file1.txt')).toBe(true);
      expect(globMatch('file?.txt', 'fileA.txt')).toBe(true);
      expect(globMatch('file?.txt', 'file12.txt')).toBe(false);
    });
  });

  describe('character classes', () => {
    it('should match character ranges', () => {
      expect(globMatch('file[0-9].txt', 'file1.txt')).toBe(true);
      expect(globMatch('file[0-9].txt', 'file9.txt')).toBe(true);
      expect(globMatch('file[0-9].txt', 'fileA.txt')).toBe(false);
    });

    it('should match character sets', () => {
      expect(globMatch('file[abc].txt', 'filea.txt')).toBe(true);
      expect(globMatch('file[abc].txt', 'fileb.txt')).toBe(true);
      expect(globMatch('file[abc].txt', 'filed.txt')).toBe(false);
    });
  });

  describe('negation patterns', () => {
    it('should handle negated character classes', () => {
      expect(globMatch('file[!0-9].txt', 'filea.txt')).toBe(true);
      expect(globMatch('file[!0-9].txt', 'file1.txt')).toBe(false);
    });
  });

  describe('complex patterns', () => {
    it('should match complex paths', () => {
      expect(globMatch('src/**/test/*.ts', 'src/utils/test/helper.ts')).toBe(true);
      expect(globMatch('src/**/test/*.ts', 'src/test/file.ts')).toBe(true);
      expect(globMatch('src/**/test/*.ts', 'src/main.ts')).toBe(false);
    });

    it('should handle multiple wildcards', () => {
      expect(globMatch('**/node_modules/**', 'a/node_modules/b/c.js')).toBe(true);
      expect(globMatch('**/*.js', 'file.js')).toBe(true);
      expect(globMatch('**/*.ts', 'file.ts')).toBe(true);
      expect(globMatch('src/**/*.js', 'src/utils/helper.js')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty patterns', () => {
      expect(globMatch('', '')).toBe(true);
      expect(globMatch('', 'file.txt')).toBe(false);
    });

    it('should handle paths with dots', () => {
      expect(globMatch('**/.config/**', '.config/app.json')).toBe(true);
      expect(globMatch('**/.*', '.hidden')).toBe(true);
    });

    it('should be case-sensitive by default', () => {
      expect(globMatch('*.TXT', 'file.txt')).toBe(false);
      expect(globMatch('*.txt', 'file.TXT')).toBe(false);
    });
  });
});
