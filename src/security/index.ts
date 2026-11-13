/**
 * Security Module Index
 *
 * Exports all security components:
 * - Audit logging for compliance
 * - Data protection (encryption, masking, PII detection)
 * - Input validation (injection prevention)
 */

export {
  AuditLogger,
  auditLogger,
  AuditEventType,
  AuditSeverity,
  type AuditEntry,
  type ComplianceReport,
  type AuditStorageConfig,
} from './AuditLogger.js';

export {
  DataProtection,
  dataProtection,
  type PIIPattern,
  type PIIDetectionResult,
  type EncryptedData,
} from './DataProtection.js';

export {
  InputValidator,
  inputValidator,
  type ValidationSchema,
  type ValidationResult,
} from './InputValidator.js';
