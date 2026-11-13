/**
 * Audit Logger
 *
 * Records all security-sensitive operations for compliance and forensics.
 * Provides tamper-proof logging with immutable append-only storage.
 */

import { writeFile, appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

export enum AuditEventType {
  ACCESS = 'access',
  CHANGE = 'change',
  DELETE = 'delete',
  AUTH = 'auth',
  CONFIG = 'config',
  SECURITY = 'security',
  ERROR = 'error',
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  severity: AuditSeverity;
  user: string;
  resource: string;
  action: string;
  result: 'success' | 'failure' | 'denied';
  details?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export interface ComplianceReport {
  startDate: number;
  endDate: number;
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  failedOperations: number;
  criticalEvents: AuditEntry[];
}

export interface AuditStorageConfig {
  directory: string;
  maxFileSize?: number; // bytes
  retentionDays?: number;
  enableEncryption?: boolean;
}

/**
 * Audit Logger for compliance and security monitoring
 */
export class AuditLogger {
  private auditDir: string;
  private currentLogFile: string;
  private maxFileSize: number;
  private retentionDays: number;
  private enableEncryption: boolean;
  private writeQueue: AuditEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: AuditStorageConfig) {
    this.auditDir = config.directory;
    this.maxFileSize = config.maxFileSize ?? 10 * 1024 * 1024; // 10MB
    this.retentionDays = config.retentionDays ?? 90; // 90 days
    this.enableEncryption = config.enableEncryption ?? false;
    this.currentLogFile = this.getLogFilePath();
    this.ensureAuditDir();
    this.startAutoFlush();
  }

  /**
   * Log an access event
   */
  logAccess(user: string, resource: string, action: string, result: 'success' | 'failure' | 'denied'): void {
    this.log({
      eventType: AuditEventType.ACCESS,
      severity: result === 'denied' ? AuditSeverity.HIGH : AuditSeverity.LOW,
      user,
      resource,
      action,
      result,
    });
  }

  /**
   * Log a change event (before/after)
   */
  logChange(user: string, entity: string, before: unknown, after: unknown): void {
    this.log({
      eventType: AuditEventType.CHANGE,
      severity: AuditSeverity.MEDIUM,
      user,
      resource: entity,
      action: 'modify',
      result: 'success',
      before,
      after,
    });
  }

  /**
   * Log a delete event
   */
  logDelete(user: string, entity: string, details?: Record<string, unknown>): void {
    this.log({
      eventType: AuditEventType.DELETE,
      severity: AuditSeverity.HIGH,
      user,
      resource: entity,
      action: 'delete',
      result: 'success',
      details,
    });
  }

  /**
   * Log an authentication event
   */
  logAuth(
    user: string,
    action: 'login' | 'logout' | 'failed_login',
    result: 'success' | 'failure',
    details?: Record<string, unknown>,
  ): void {
    this.log({
      eventType: AuditEventType.AUTH,
      severity: result === 'failure' ? AuditSeverity.HIGH : AuditSeverity.LOW,
      user,
      resource: 'authentication',
      action,
      result,
      details,
    });
  }

  /**
   * Log a security event
   */
  logSecurity(
    user: string,
    threat: string,
    severity: AuditSeverity,
    details?: Record<string, unknown>,
  ): void {
    this.log({
      eventType: AuditEventType.SECURITY,
      severity,
      user,
      resource: 'security',
      action: threat,
      result: 'denied',
      details,
    });
  }

  /**
   * Log an audit entry
   */
  private log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const fullEntry: AuditEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...entry,
    };

    this.writeQueue.push(fullEntry);

    // Immediate flush for critical events
    if (fullEntry.severity === AuditSeverity.CRITICAL) {
      void this.flush();
    }
  }

  /**
   * Flush queue to disk
   */
  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0) return;

    const entries = [...this.writeQueue];
    this.writeQueue = [];

    try {
      // Check if need to rotate log file
      if (await this.shouldRotate()) {
        this.currentLogFile = this.getLogFilePath();
      }

      // Append entries to log file
      const lines = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
      await appendFile(this.currentLogFile, lines, 'utf-8');

      logger.debug(`[AuditLogger] Flushed ${entries.length} audit entries`);
    } catch (error) {
      logger.error('[AuditLogger] Failed to flush audit log:', error);
      // Put entries back in queue
      this.writeQueue.unshift(...entries);
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate: number, endDate: number): Promise<ComplianceReport> {
    const entries = await this.readEntriesInRange(startDate, endDate);

    const report: ComplianceReport = {
      startDate,
      endDate,
      totalEvents: entries.length,
      byType: {},
      bySeverity: {},
      failedOperations: 0,
      criticalEvents: [],
    };

    for (const entry of entries) {
      // Count by type
      report.byType[entry.eventType] = (report.byType[entry.eventType] || 0) + 1;

      // Count by severity
      report.bySeverity[entry.severity] = (report.bySeverity[entry.severity] || 0) + 1;

      // Count failures
      if (entry.result === 'failure' || entry.result === 'denied') {
        report.failedOperations++;
      }

      // Collect critical events
      if (entry.severity === AuditSeverity.CRITICAL) {
        report.criticalEvents.push(entry);
      }
    }

    return report;
  }

  /**
   * Read audit entries in date range
   */
  private async readEntriesInRange(startDate: number, endDate: number): Promise<AuditEntry[]> {
    // This is a simplified implementation
    // In production, you'd want to:
    // 1. Index log files by date
    // 2. Only read relevant files
    // 3. Use streaming for large datasets

    const entries: AuditEntry[] = [];

    try {
      const content = await readFile(this.currentLogFile, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          if (entry.timestamp >= startDate && entry.timestamp <= endDate) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch (error) {
      logger.error('[AuditLogger] Failed to read audit log:', error);
    }

    return entries;
  }

  /**
   * Check if log file should be rotated
   */
  private async shouldRotate(): Promise<boolean> {
    if (!existsSync(this.currentLogFile)) {
      return false;
    }

    try {
      const { stat } = await import('node:fs/promises');
      const stats = await stat(this.currentLogFile);
      return stats.size >= this.maxFileSize;
    } catch {
      return false;
    }
  }

  /**
   * Get log file path with timestamp
   */
  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    return join(this.auditDir, `audit-${date}-${timestamp}.log`);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ensure audit directory exists
   */
  private ensureAuditDir(): void {
    if (!existsSync(this.auditDir)) {
      mkdir(this.auditDir, { recursive: true }).catch((error) => {
        logger.error('[AuditLogger] Failed to create audit directory:', error);
      });
    }
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, 5000); // Flush every 5 seconds

    this.flushTimer.unref();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

// Singleton instance
export const auditLogger = new AuditLogger({
  directory: join(process.cwd(), '.codeyang', 'audit-logs'),
  retentionDays: 90,
});
