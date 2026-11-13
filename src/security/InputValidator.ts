/**
 * Input Validator
 *
 * Comprehensive input validation to prevent injection attacks:
 * - SQL injection
 * - XSS (Cross-Site Scripting)
 * - Path traversal
 * - Command injection
 * - Schema validation
 */

import { logger } from '../utils/logger.js';

export interface ValidationSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: unknown[];
  properties?: Record<string, ValidationSchema>;
  items?: ValidationSchema;
  custom?: (value: unknown) => boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Input Validator with security checks
 */
export class InputValidator {
  /**
   * Validate input against schema
   */
  validate(input: unknown, schema: ValidationSchema, path: string = 'input'): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

    // Check required
    if (schema.required && (input === undefined || input === null)) {
      result.valid = false;
      result.errors.push(`${path} is required`);
      return result;
    }

    // Allow null/undefined for optional fields
    if (!schema.required && (input === undefined || input === null)) {
      return result;
    }

    // Type validation
    const actualType = Array.isArray(input) ? 'array' : typeof input;
    if (actualType !== schema.type) {
      result.valid = false;
      result.errors.push(`${path} must be of type ${schema.type}, got ${actualType}`);
      return result;
    }

    // Type-specific validations
    if (schema.type === 'string' && typeof input === 'string') {
      this.validateString(input, schema, path, result);
    } else if (schema.type === 'number' && typeof input === 'number') {
      this.validateNumber(input, schema, path, result);
    } else if (schema.type === 'object' && typeof input === 'object' && !Array.isArray(input)) {
      this.validateObject(input as Record<string, unknown>, schema, path, result);
    } else if (schema.type === 'array' && Array.isArray(input)) {
      this.validateArray(input, schema, path, result);
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(input)) {
      result.valid = false;
      result.errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
    }

    // Custom validation
    if (schema.custom && !schema.custom(input)) {
      result.valid = false;
      result.errors.push(`${path} failed custom validation`);
    }

    return result;
  }

  /**
   * Validate string
   */
  private validateString(
    input: string,
    schema: ValidationSchema,
    path: string,
    result: ValidationResult,
  ): void {
    if (schema.minLength !== undefined && input.length < schema.minLength) {
      result.valid = false;
      result.errors.push(`${path} must be at least ${schema.minLength} characters`);
    }

    if (schema.maxLength !== undefined && input.length > schema.maxLength) {
      result.valid = false;
      result.errors.push(`${path} must be at most ${schema.maxLength} characters`);
    }

    if (schema.pattern && !schema.pattern.test(input)) {
      result.valid = false;
      result.errors.push(`${path} does not match required pattern`);
    }
  }

  /**
   * Validate number
   */
  private validateNumber(
    input: number,
    schema: ValidationSchema,
    path: string,
    result: ValidationResult,
  ): void {
    if (schema.min !== undefined && input < schema.min) {
      result.valid = false;
      result.errors.push(`${path} must be at least ${schema.min}`);
    }

    if (schema.max !== undefined && input > schema.max) {
      result.valid = false;
      result.errors.push(`${path} must be at most ${schema.max}`);
    }
  }

  /**
   * Validate object
   */
  private validateObject(
    input: Record<string, unknown>,
    schema: ValidationSchema,
    path: string,
    result: ValidationResult,
  ): void {
    if (!schema.properties) return;

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propResult = this.validate(input[key], propSchema, `${path}.${key}`);
      if (!propResult.valid) {
        result.valid = false;
        result.errors.push(...propResult.errors);
      }
    }
  }

  /**
   * Validate array
   */
  private validateArray(
    input: unknown[],
    schema: ValidationSchema,
    path: string,
    result: ValidationResult,
  ): void {
    if (schema.minLength !== undefined && input.length < schema.minLength) {
      result.valid = false;
      result.errors.push(`${path} must contain at least ${schema.minLength} items`);
    }

    if (schema.maxLength !== undefined && input.length > schema.maxLength) {
      result.valid = false;
      result.errors.push(`${path} must contain at most ${schema.maxLength} items`);
    }

    if (schema.items) {
      input.forEach((item, index) => {
        const itemResult = this.validate(item, schema.items!, `${path}[${index}]`);
        if (!itemResult.valid) {
          result.valid = false;
          result.errors.push(...itemResult.errors);
        }
      });
    }
  }

  /**
   * Check for SQL injection
   */
  checkSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\bUNION\b.*\bSELECT\b)/i,
      /(\bSELECT\b.*\bFROM\b)/i,
      /(\bINSERT\b.*\bINTO\b)/i,
      /(\bUPDATE\b.*\bSET\b)/i,
      /(\bDELETE\b.*\bFROM\b)/i,
      /(\bDROP\b.*\bTABLE\b)/i,
      /(\bEXEC\b.*\()/i,
      /(;.*--)/,
      /('.*OR.*'.*=.*')/i,
      /(\/\*.*\*\/)/,
    ];

    return sqlPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Check for XSS
   */
  checkXSS(input: string): boolean {
    const xssPatterns = [
      /<script[^>]*>.*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // onclick=, onload=, etc.
      /<iframe[^>]*>/gi,
      /<embed[^>]*>/gi,
      /<object[^>]*>/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
    ];

    return xssPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Check for path traversal
   */
  checkPathTraversal(path: string): boolean {
    const traversalPatterns = [
      /\.\.[\/\\]/,  // ../
      /\.\.[\/\\]{2,}/, // ..//
      /%2e%2e[\/\\]/i, // URL encoded ../
      /\.\.%2f/i,
      /\.\.%5c/i,
    ];

    return traversalPatterns.some((pattern) => pattern.test(path));
  }

  /**
   * Check for command injection
   */
  checkCommandInjection(input: string): boolean {
    const cmdPatterns = [
      /[;&|`$()]/,  // Shell operators
      /\n/,         // Newline
      /\r/,         // Carriage return
    ];

    return cmdPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Sanitize HTML
   */
  sanitizeHTML(html: string): string {
    return html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Sanitize file path
   */
  sanitizePath(path: string): string {
    // Remove any path traversal attempts
    return path
      .replace(/\.\.[\/\\]/g, '')
      .replace(/^[\/\\]+/, '')
      .replace(/[\/\\]+$/, '');
  }

  /**
   * Validate email format
   */
  isValidEmail(email: string): boolean {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  }

  /**
   * Validate URL format
   */
  isValidURL(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Validate IP address
   */
  isValidIPAddress(ip: string): boolean {
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    if (ipv4Pattern.test(ip)) {
      const parts = ip.split('.');
      return parts.every((part) => parseInt(part) >= 0 && parseInt(part) <= 255);
    }

    return ipv6Pattern.test(ip);
  }

  /**
   * Validate and sanitize input
   */
  validateAndSanitize(
    input: string,
    options: {
      checkSQL?: boolean;
      checkXSS?: boolean;
      checkPath?: boolean;
      checkCmd?: boolean;
      sanitizeHTML?: boolean;
    } = {},
  ): { valid: boolean; sanitized: string; threats: string[] } {
    const threats: string[] = [];
    let sanitized = input;

    // Check for threats
    if (options.checkSQL && this.checkSQLInjection(input)) {
      threats.push('SQL Injection detected');
    }

    if (options.checkXSS && this.checkXSS(input)) {
      threats.push('XSS detected');
    }

    if (options.checkPath && this.checkPathTraversal(input)) {
      threats.push('Path Traversal detected');
    }

    if (options.checkCmd && this.checkCommandInjection(input)) {
      threats.push('Command Injection detected');
    }

    // Sanitize if requested
    if (options.sanitizeHTML) {
      sanitized = this.sanitizeHTML(input);
    }

    return {
      valid: threats.length === 0,
      sanitized,
      threats,
    };
  }
}

// Singleton instance
export const inputValidator = new InputValidator();
