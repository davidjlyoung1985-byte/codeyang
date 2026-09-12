import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { getPonytailPrompt, getPonytailLevel, type PonytailLevel } from './ponytail-prompt.js';

describe('Ponytail Prompt', () => {
  describe('getPonytailPrompt', () => {
    test('should return empty string for "off" level', () => {
      const result = getPonytailPrompt('off');
      expect(result).toBe('');
    });

    test('should return lite prompt for "lite" level', () => {
      const result = getPonytailPrompt('lite');
      expect(result).toContain('## Ponytail (Lite)');
      expect(result).toContain('Does this need to be built at all?');
      expect(result).toContain('no unnecessary abstractions');
      expect(result).not.toContain('Ultra Mode');
      expect(result).not.toContain('Not Lazy About');
    });

    test('should return full prompt for "full" level', () => {
      const result = getPonytailPrompt('full');
      expect(result).toContain('## Ponytail: Lazy Senior Dev Mode');
      expect(result).toContain('Does this need to be built at all?');
      expect(result).toContain('### Rules');
      expect(result).toContain('### Not Lazy About');
      expect(result).not.toContain('Ultra Mode');
    });

    test('should return ultra prompt for "ultra" level', () => {
      const result = getPonytailPrompt('ultra');
      expect(result).toContain('## Ponytail: Lazy Senior Dev Mode');
      expect(result).toContain('### Ultra Mode (Extra Aggressive)');
      expect(result).toContain('Before adding any new file');
      expect(result).toContain('3 files max per task');
    });

    test('should include ladder in all non-off levels', () => {
      const levels: PonytailLevel[] = ['lite', 'full', 'ultra'];
      levels.forEach((level) => {
        const result = getPonytailPrompt(level);
        expect(result).toContain('Does this need to be built at all?');
        expect(result).toContain('Already in this codebase?');
        expect(result).toContain('Standard library does it?');
      });
    });

    test('should include YAGNI principle in full and ultra', () => {
      expect(getPonytailPrompt('full')).toContain('YAGNI');
      expect(getPonytailPrompt('ultra')).toContain('YAGNI');
    });

    test('should include bug fix guidance in full and ultra', () => {
      expect(getPonytailPrompt('full')).toContain('Bug Fix = Root Cause');
      expect(getPonytailPrompt('ultra')).toContain('Bug Fix = Root Cause');
    });

    test('should mention ponytail comments in full and ultra', () => {
      expect(getPonytailPrompt('full')).toContain('ponytail:');
      expect(getPonytailPrompt('ultra')).toContain('ponytail:');
    });
  });

  describe('getPonytailLevel', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env['PONYTAIL_MODE'];
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env['PONYTAIL_MODE'];
      } else {
        process.env['PONYTAIL_MODE'] = originalEnv;
      }
    });

    test('should return "off" when env var is not set', () => {
      delete process.env['PONYTAIL_MODE'];
      expect(getPonytailLevel()).toBe('off');
    });

    test('should return "lite" when env var is "lite"', () => {
      process.env['PONYTAIL_MODE'] = 'lite';
      expect(getPonytailLevel()).toBe('lite');
    });

    test('should return "full" when env var is "full"', () => {
      process.env['PONYTAIL_MODE'] = 'full';
      expect(getPonytailLevel()).toBe('full');
    });

    test('should return "ultra" when env var is "ultra"', () => {
      process.env['PONYTAIL_MODE'] = 'ultra';
      expect(getPonytailLevel()).toBe('ultra');
    });

    test('should handle uppercase values', () => {
      process.env['PONYTAIL_MODE'] = 'LITE';
      expect(getPonytailLevel()).toBe('lite');

      process.env['PONYTAIL_MODE'] = 'FULL';
      expect(getPonytailLevel()).toBe('full');

      process.env['PONYTAIL_MODE'] = 'ULTRA';
      expect(getPonytailLevel()).toBe('ultra');
    });

    test('should handle mixed case values', () => {
      process.env['PONYTAIL_MODE'] = 'LiTe';
      expect(getPonytailLevel()).toBe('lite');

      process.env['PONYTAIL_MODE'] = 'FuLl';
      expect(getPonytailLevel()).toBe('full');
    });

    test('should trim whitespace', () => {
      process.env['PONYTAIL_MODE'] = '  lite  ';
      expect(getPonytailLevel()).toBe('lite');

      process.env['PONYTAIL_MODE'] = '\tfull\n';
      expect(getPonytailLevel()).toBe('full');
    });

    test('should return "off" for invalid values', () => {
      process.env['PONYTAIL_MODE'] = 'invalid';
      expect(getPonytailLevel()).toBe('off');

      process.env['PONYTAIL_MODE'] = 'medium';
      expect(getPonytailLevel()).toBe('off');

      process.env['PONYTAIL_MODE'] = '';
      expect(getPonytailLevel()).toBe('off');
    });

    test('should return "off" for empty string', () => {
      process.env['PONYTAIL_MODE'] = '';
      expect(getPonytailLevel()).toBe('off');
    });

    test('should return "off" for whitespace-only string', () => {
      process.env['PONYTAIL_MODE'] = '   ';
      expect(getPonytailLevel()).toBe('off');
    });
  });

  describe('Prompt Content Validation', () => {
    test('full prompt should include all key sections', () => {
      const prompt = getPonytailPrompt('full');

      // Check for main sections
      expect(prompt).toContain('Lazy Senior Dev Mode');
      expect(prompt).toContain('### Rules');
      expect(prompt).toContain('### Not Lazy About');

      // Check for key concepts
      expect(prompt).toContain('Deletion over addition');
      expect(prompt).toContain('Shortest working diff');
      expect(prompt).toContain('Input validation');
      expect(prompt).toContain('Error handling');
    });

    test('ultra prompt should include all sections plus ultra', () => {
      const prompt = getPonytailPrompt('ultra');

      expect(prompt).toContain('### Ultra Mode');
      expect(prompt).toContain('Before adding any new file');
      expect(prompt).toContain('When in doubt, delete');
      expect(prompt).toContain('3 files max per task');
    });

    test('lite prompt should be shorter than full', () => {
      const lite = getPonytailPrompt('lite');
      const full = getPonytailPrompt('full');

      expect(lite.length).toBeLessThan(full.length);
    });

    test('ultra prompt should be longer than full', () => {
      const full = getPonytailPrompt('full');
      const ultra = getPonytailPrompt('ultra');

      expect(ultra.length).toBeGreaterThan(full.length);
    });
  });
});
