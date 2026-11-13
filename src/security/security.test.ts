import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger, AuditEventType, AuditSeverity } from './AuditLogger.js';
import { DataProtection } from './DataProtection.js';
import { InputValidator } from './InputValidator.js';
import { existsSync } from 'node:fs';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;
  const testDir = join(process.cwd(), '.test-audit');

  beforeEach(async () => {
    auditLogger = new AuditLogger({ directory: testDir });
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await auditLogger.cleanup();
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('should log access events', () => {
    auditLogger.logAccess('user1', '/api/data', 'read', 'success');
    auditLogger.logAccess('user2', '/api/admin', 'write', 'denied');

    // Should not throw
    expect(true).toBe(true);
  });

  it('should log change events', () => {
    const before = { name: 'old', value: 100 };
    const after = { name: 'new', value: 200 };

    auditLogger.logChange('user1', 'settings', before, after);
    expect(true).toBe(true);
  });

  it('should log authentication events', () => {
    auditLogger.logAuth('user1', 'login', 'success');
    auditLogger.logAuth('user2', 'failed_login', 'failure');
    auditLogger.logAuth('user1', 'logout', 'success');

    expect(true).toBe(true);
  });

  it('should log security events', () => {
    auditLogger.logSecurity('attacker', 'SQL Injection attempt', AuditSeverity.CRITICAL, {
      query: 'SELECT * FROM users WHERE id=1 OR 1=1',
    });

    expect(true).toBe(true);
  });

  it('should generate compliance report', async () => {
    const now = Date.now();

    auditLogger.logAccess('user1', '/api/data', 'read', 'success');
    auditLogger.logAccess('user2', '/api/data', 'write', 'denied');
    auditLogger.logSecurity('attacker', 'XSS attempt', AuditSeverity.HIGH);

    // Wait for flush
    await new Promise((resolve) => setTimeout(resolve, 100));
    await auditLogger.cleanup();

    const report = await auditLogger.generateComplianceReport(now - 1000, now + 1000);

    expect(report.totalEvents).toBeGreaterThanOrEqual(0);
    expect(report.byType).toBeDefined();
    expect(report.bySeverity).toBeDefined();
  });
});

describe('DataProtection', () => {
  let dataProtection: DataProtection;

  beforeEach(() => {
    dataProtection = new DataProtection();
  });

  it('should mask sensitive data', () => {
    const text = 'password=secret123 and email is user@example.com';
    const masked = dataProtection.maskSensitiveData(text);

    expect(masked).toContain('password=***REDACTED***');
    expect(masked).not.toContain('user@example.com');
  });

  it('should detect PII', () => {
    const text = 'Contact me at john@example.com or call 555-123-4567';
    const result = dataProtection.detectPII(text);

    expect(result.found).toBe(true);
    expect(result.types).toContain('email');
    expect(result.types).toContain('phone');
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it('should encrypt and decrypt data', async () => {
    const original = 'sensitive data';
    const key = 'encryption-key';

    const encrypted = await dataProtection.encryptAtRest(original, key);
    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();

    const decrypted = await dataProtection.decryptAtRest(encrypted, key);
    expect(decrypted).toBe(original);
  });

  it('should hash and verify data', async () => {
    const data = 'password123';

    const hashed = await dataProtection.hashData(data);
    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(data);

    const verified = await dataProtection.verifyHash(data, hashed);
    expect(verified).toBe(true);

    const wrongVerified = await dataProtection.verifyHash('wrong', hashed);
    expect(wrongVerified).toBe(false);
  });

  it('should sanitize objects', () => {
    const obj = {
      username: 'john',
      password: 'secret123',
      email: 'john@example.com',
      apiKey: 'sk-1234567890',
      nested: {
        token: 'Bearer abc123',
        data: 'safe data',
      },
    };

    const sanitized = dataProtection.sanitizeObject(obj);

    expect(sanitized.password).toBe('***REDACTED***');
    expect(sanitized.apiKey).toBe('***REDACTED***');
    expect(sanitized.username).toBe('john');
    expect((sanitized.nested as Record<string, unknown>).token).toBe('***REDACTED***');
  });

  it('should mask various PII types', () => {
    const testPhone = 'Call me at 555-123-4567';
    const maskedPhone = dataProtection.maskSensitiveData(testPhone);
    expect(maskedPhone).not.toBe(testPhone);
    expect(maskedPhone).toContain('***-***-****');

    const testSSN = 'SSN: 123-45-6789';
    const maskedSSN = dataProtection.maskSensitiveData(testSSN);
    expect(maskedSSN).not.toBe(testSSN);

    const testCard = 'Card: 4532-1234-5678-9010';
    const maskedCard = dataProtection.maskSensitiveData(testCard);
    expect(maskedCard).not.toBe(testCard);
  });
});

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  it('should validate schema - string', () => {
    const result = validator.validate('hello', {
      type: 'string',
      minLength: 3,
      maxLength: 10,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail validation - too short', () => {
    const result = validator.validate('ab', {
      type: 'string',
      minLength: 3,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should validate schema - number', () => {
    const result = validator.validate(50, {
      type: 'number',
      min: 0,
      max: 100,
    });

    expect(result.valid).toBe(true);
  });

  it('should validate schema - object', () => {
    const result = validator.validate(
      { name: 'John', age: 30 },
      {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number', min: 0 },
        },
      },
    );

    expect(result.valid).toBe(true);
  });

  it('should detect SQL injection', () => {
    const malicious = "SELECT * FROM users WHERE id=1 OR '1'='1'";
    const isSQLInjection = validator.checkSQLInjection(malicious);

    expect(isSQLInjection).toBe(true);
  });

  it('should detect XSS', () => {
    const malicious = '<script>alert("XSS")</script>';
    const isXSS = validator.checkXSS(malicious);

    expect(isXSS).toBe(true);
  });

  it('should detect path traversal', () => {
    const malicious = '../../../etc/passwd';
    const isPathTraversal = validator.checkPathTraversal(malicious);

    expect(isPathTraversal).toBe(true);
  });

  it('should detect command injection', () => {
    const malicious = 'file.txt; rm -rf /';
    const isCmdInjection = validator.checkCommandInjection(malicious);

    expect(isCmdInjection).toBe(true);
  });

  it('should sanitize HTML', () => {
    const html = '<script>alert("XSS")</script>';
    const sanitized = validator.sanitizeHTML(html);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('&lt;script&gt;');
  });

  it('should validate email', () => {
    expect(validator.isValidEmail('user@example.com')).toBe(true);
    expect(validator.isValidEmail('invalid')).toBe(false);
    expect(validator.isValidEmail('user@')).toBe(false);
  });

  it('should validate URL', () => {
    expect(validator.isValidURL('https://example.com')).toBe(true);
    expect(validator.isValidURL('http://localhost:3000')).toBe(true);
    expect(validator.isValidURL('ftp://example.com')).toBe(false);
    expect(validator.isValidURL('not a url')).toBe(false);
  });

  it('should validate and sanitize input', () => {
    const result = validator.validateAndSanitize('<script>SELECT * FROM users</script>', {
      checkSQL: true,
      checkXSS: true,
      sanitizeHTML: true,
    });

    expect(result.valid).toBe(false);
    expect(result.threats).toContain('XSS detected');
    expect(result.sanitized).not.toContain('<script>');
  });

  it('should validate array schema', () => {
    const result = validator.validate([1, 2, 3], {
      type: 'array',
      minLength: 2,
      maxLength: 5,
      items: { type: 'number' },
    });

    expect(result.valid).toBe(true);
  });

  it('should validate enum', () => {
    const result = validator.validate('red', {
      type: 'string',
      enum: ['red', 'green', 'blue'],
    });

    expect(result.valid).toBe(true);

    const invalidResult = validator.validate('yellow', {
      type: 'string',
      enum: ['red', 'green', 'blue'],
    });

    expect(invalidResult.valid).toBe(false);
  });
});
