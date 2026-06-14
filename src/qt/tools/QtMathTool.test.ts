import { describe, it, expect } from 'vitest';
import { executeQtMath } from './QtMathTool.js';

describe('QtMathTool', () => {
  describe('Safe expression evaluation', () => {
    it('should evaluate basic arithmetic', () => {
      const result = executeQtMath('eval', '2 + 2');
      expect(result).toContain('2 + 2');
      expect(result).toContain('4');
    });

    it('should evaluate math functions', () => {
      const result = executeQtMath('eval', 'sqrt(16)');
      expect(result).toContain('sqrt(16)');
      expect(result).toContain('4');
    });

    it('should handle trigonometric functions', () => {
      const result = executeQtMath('eval', 'sin(pi/2)');
      expect(result).toContain('sin(pi/2)');
      expect(result).toContain('1');
    });

    it('should support power operations', () => {
      const result = executeQtMath('eval', '2^8');
      expect(result).toContain('256');
    });

    it('should handle complex expressions', () => {
      const result = executeQtMath('eval', '(3 + 4) * 2 - sqrt(25)');
      expect(result).toContain('9');
    });

    it('should show hex representation for integers', () => {
      const result = executeQtMath('eval', '255');
      expect(result).toContain('Hex: 0xFF');
      expect(result).toContain('Binary: 0b11111111');
    });

    it('should show hex but not binary for larger integers', () => {
      const result = executeQtMath('eval', '1024');
      expect(result).toContain('Hex: 0x400');
      expect(result).not.toContain('Binary');
    });
  });

  describe('Security - Code injection prevention', () => {
    it('should block Function constructor attempts', () => {
      const result = executeQtMath('eval', 'Function("return 42")()');
      expect(result).toContain('Error');
    });

    it('should block eval attempts', () => {
      const result = executeQtMath('eval', 'eval("2+2")');
      expect(result).toContain('Error');
    });

    it('should block require/import attempts', () => {
      const result1 = executeQtMath('eval', 'require("fs")');
      expect(result1).toContain('Error');
      expect(result1).toContain('forbidden pattern');

      const result2 = executeQtMath('eval', 'import("os")');
      expect(result2).toContain('Error');
      expect(result2).toContain('forbidden pattern');
    });

    it('should block arrow functions', () => {
      const result = executeQtMath('eval', '(() => 42)()');
      expect(result).toContain('Error');
      expect(result).toContain('forbidden pattern');
    });

    it('should block constructor access', () => {
      const result = executeQtMath('eval', '(2).constructor("return 42")()');
      expect(result).toContain('Error');
      expect(result).toContain('forbidden pattern');
    });

    it('should block prototype manipulation', () => {
      const result1 = executeQtMath('eval', 'Object.prototype.foo = 1');
      expect(result1).toContain('Error');
      expect(result1).toContain('forbidden pattern');

      const result2 = executeQtMath('eval', '__proto__.bar = 2');
      expect(result2).toContain('Error');
      expect(result2).toContain('forbidden pattern');
    });

    it('should block excessively long expressions', () => {
      const longExpr = '1+1'.repeat(300);
      const result = executeQtMath('eval', longExpr);
      expect(result).toContain('Error');
      expect(result).toContain('500 characters');
    });

    it('should block empty expressions', () => {
      const result = executeQtMath('eval', '');
      expect(result).toContain('Error');
      expect(result).toContain('500 characters');
    });

    it('should handle non-finite results', () => {
      const result = executeQtMath('eval', '1/0');
      expect(result).toContain('Error');
      expect(result).toContain('not a finite number');
    });

    it('should reject expressions with side effects attempts', () => {
      // mathjs should safely reject these, but our validation catches them first
      const result = executeQtMath('eval', 'console.log("pwned")');
      expect(result).toContain('Error');
    });
  });

  describe('Reference documentation', () => {
    it('should return Qt math reference when no action specified', () => {
      const result = executeQtMath();
      expect(result).toContain('Qt Math Reference');
      expect(result).toContain('QtMath');
      expect(result).toContain('qAbs');
      expect(result).toContain('QVector3D');
      expect(result).toContain('QMatrix4x4');
    });

    it('should return reference when action is not eval', () => {
      const result = executeQtMath('help');
      expect(result).toContain('Qt Math Reference');
    });
  });

  describe('Edge cases', () => {
    it('should handle negative numbers', () => {
      const result = executeQtMath('eval', '-5 + 3');
      expect(result).toContain('-2');
    });

    it('should handle decimals', () => {
      const result = executeQtMath('eval', '3.14 * 2');
      expect(result).toContain('6.28');
    });

    it('should handle constants', () => {
      const result = executeQtMath('eval', 'e');
      expect(result).toContain('2.71828');
    });

    it('should handle nested function calls', () => {
      const result = executeQtMath('eval', 'sqrt(abs(-16))');
      expect(result).toContain('4');
    });

    it('should handle modulo operator', () => {
      const result = executeQtMath('eval', '10 % 3');
      expect(result).toContain('1');
    });
  });
});
