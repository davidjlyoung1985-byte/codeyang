/**
 * Data Protection
 *
 * Provides automatic detection and masking of sensitive data:
 * - PII (Personally Identifiable Information)
 * - API keys, tokens, passwords
 * - Credit card numbers
 * - SSN, phone numbers
 * - Email addresses
 */

import { logger } from '../utils/logger.js';

export interface PIIPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface PIIDetectionResult {
  found: boolean;
  types: string[];
  matches: Array<{ type: string; value: string; position: number }>;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  algorithm: string;
}

/**
 * Data Protection Manager
 */
export class DataProtection {
  private sensitivePatterns: PIIPattern[] = [];

  constructor() {
    this.registerDefaultPatterns();
  }

  /**
   * Mask sensitive data in text
   */
  maskSensitiveData(text: string, patterns?: PIIPattern[]): string {
    if (!text || typeof text !== 'string') return text;

    const patternsToUse = patterns || this.sensitivePatterns;
    let masked = text;

    for (const pattern of patternsToUse) {
      masked = masked.replace(pattern.pattern, pattern.replacement);
    }

    return masked;
  }

  /**
   * Detect PII in text
   */
  detectPII(text: string): PIIDetectionResult {
    const result: PIIDetectionResult = {
      found: false,
      types: [],
      matches: [],
    };

    if (!text || typeof text !== 'string') return result;

    for (const pattern of this.sensitivePatterns) {
      const matches = text.matchAll(pattern.pattern);
      for (const match of matches) {
        if (match[0]) {
          result.found = true;
          if (!result.types.includes(pattern.name)) {
            result.types.push(pattern.name);
          }
          result.matches.push({
            type: pattern.name,
            value: match[0],
            position: match.index || 0,
          });
        }
      }
    }

    return result;
  }

  /**
   * Encrypt data at rest
   */
  async encryptAtRest(data: string, key: string): Promise<EncryptedData> {
    try {
      const { createCipheriv, randomBytes, createHash } = await import('node:crypto');

      // Derive key from password
      const derivedKey = createHash('sha256').update(key).digest();

      // Generate IV
      const iv = randomBytes(16);

      // Create cipher
      const cipher = createCipheriv('aes-256-cbc', derivedKey, iv);

      // Encrypt
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encrypted,
        iv: iv.toString('hex'),
        algorithm: 'aes-256-cbc',
      };
    } catch (error) {
      logger.error('[DataProtection] Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data at rest
   */
  async decryptAtRest(encrypted: EncryptedData, key: string): Promise<string> {
    try {
      const { createDecipheriv, createHash } = await import('node:crypto');

      // Derive key from password
      const derivedKey = createHash('sha256').update(key).digest();

      // Convert IV from hex
      const iv = Buffer.from(encrypted.iv, 'hex');

      // Create decipher
      const decipher = createDecipheriv('aes-256-cbc', derivedKey, iv);

      // Decrypt
      let decrypted = decipher.update(encrypted.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('[DataProtection] Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Hash sensitive data (one-way)
   */
  async hashData(data: string, salt?: string): Promise<string> {
    try {
      const { createHash, randomBytes } = await import('node:crypto');

      const actualSalt = salt || randomBytes(16).toString('hex');
      const hash = createHash('sha256');
      hash.update(data + actualSalt);

      return `${hash.digest('hex')}.${actualSalt}`;
    } catch (error) {
      logger.error('[DataProtection] Hashing failed:', error);
      throw new Error('Hashing failed');
    }
  }

  /**
   * Verify hashed data
   */
  async verifyHash(data: string, hashedData: string): Promise<boolean> {
    try {
      const [, salt] = hashedData.split('.');
      if (!salt) return false;

      const newHash = await this.hashData(data, salt);
      return newHash === hashedData;
    } catch (error) {
      logger.error('[DataProtection] Hash verification failed:', error);
      return false;
    }
  }

  /**
   * Register a custom sensitive pattern
   */
  registerPattern(pattern: PIIPattern): void {
    this.sensitivePatterns.push(pattern);
    logger.info(`[DataProtection] Registered pattern: ${pattern.name}`);
  }

  /**
   * Register default sensitive patterns
   */
  private registerDefaultPatterns(): void {
    // API Keys and Tokens (more specific pattern)
    this.registerPattern({
      name: 'api_key',
      pattern: /\b(?:sk|pk)_[a-z]+_[A-Za-z0-9]{20,}/g,
      replacement: '***API_KEY***',
    });

    // Passwords in URLs or configs
    this.registerPattern({
      name: 'password',
      pattern: /(?:password|passwd|pwd)[\s:=]+([^\s&]+)/gi,
      replacement: 'password=***REDACTED***',
    });

    // Authorization headers
    this.registerPattern({
      name: 'auth_token',
      pattern: /(?:Bearer|Basic)\s+[A-Za-z0-9_\-\.]+/gi,
      replacement: 'Bearer ***TOKEN***',
    });

    // Email addresses
    this.registerPattern({
      name: 'email',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: '***@***.***',
    });

    // Credit card numbers (basic pattern)
    this.registerPattern({
      name: 'credit_card',
      pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
      replacement: '****-****-****-****',
    });

    // Phone numbers (US format)
    this.registerPattern({
      name: 'phone',
      pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      replacement: '***-***-****',
    });

    // SSN (US)
    this.registerPattern({
      name: 'ssn',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: '***-**-****',
    });

    // IP addresses
    this.registerPattern({
      name: 'ip_address',
      pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      replacement: '***.***.***.***',
    });

    // AWS Access Keys
    this.registerPattern({
      name: 'aws_key',
      pattern: /AKIA[0-9A-Z]{16}/g,
      replacement: 'AKIA***************',
    });

    // JWT tokens
    this.registerPattern({
      name: 'jwt',
      pattern: /eyJ[A-Za-z0-9_\-]*\.eyJ[A-Za-z0-9_\-]*\.[A-Za-z0-9_\-]*/g,
      replacement: 'eyJ***.eyJ***.***',
    });

    // GitHub tokens
    this.registerPattern({
      name: 'github_token',
      pattern: /gh[a-z]_[A-Za-z0-9]{36}/g,
      replacement: 'gh*_***********************************',
    });

    // Private keys
    this.registerPattern({
      name: 'private_key',
      pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
      replacement: '-----BEGIN PRIVATE KEY-----\n***REDACTED***\n-----END PRIVATE KEY-----',
    });
  }

  /**
   * Sanitize object recursively
   */
  sanitizeObject<T>(obj: T, depth: number = 0): T {
    if (depth > 10) return obj; // Prevent infinite recursion

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item, depth + 1)) as T;
    }

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key', 'authorization'];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key is sensitive
      if (sensitiveKeys.some((k) => lowerKey.includes(k))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'string') {
        // Mask sensitive data in strings
        sanitized[key] = this.maskSensitiveData(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeObject(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as T;
  }
}

// Singleton instance
export const dataProtection = new DataProtection();
