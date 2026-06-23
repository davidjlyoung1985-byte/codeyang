import type { ToolCall, ToolResult } from '../types.js';

export interface ExecutionRecord {
  id: string;
  timestamp: number;
  task: string;
  toolCalls: ToolCall[];
  results: ToolResult[];
  success: boolean;
  errorMessage?: string;
  durationMs: number;
}

/**
 * Tracks tool execution history in a circular buffer.
 * Used by ReflexionEngine to analyze failures and learn patterns.
 */
export class ExecutionTracker {
  private records: ExecutionRecord[] = [];
  private maxRecords: number;
  private currentId = 0;

  constructor(maxRecords = 100) {
    this.maxRecords = maxRecords;
  }

  /**
   * Record a new execution outcome
   */
  record(record: Omit<ExecutionRecord, 'id'>): string {
    const id = `exec_${++this.currentId}`;
    const fullRecord: ExecutionRecord = { ...record, id };

    this.records.push(fullRecord);

    // Circular buffer: remove oldest if over limit
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }

    return id;
  }

  /**
   * Get recent records (default: last 10)
   */
  getRecent(count = 10): ExecutionRecord[] {
    return this.records.slice(-count);
  }

  /**
   * Get all records
   */
  getAll(): ExecutionRecord[] {
    return this.records.slice();
  }

  /**
   * Get records by IDs
   */
  getByIds(ids: string[]): ExecutionRecord[] {
    const idSet = new Set(ids);
    return this.records.filter((r) => idSet.has(r.id));
  }

  /**
   * Get recent failure records
   */
  getRecentFailures(count = 5): ExecutionRecord[] {
    return this.records.filter((r) => !r.success).slice(-count);
  }

  /**
   * Check if there are consecutive failures for similar tasks
   */
  hasConsecutiveFailures(threshold = 2): boolean {
    const recent = this.getRecent(threshold);
    if (recent.length < threshold) return false;
    return recent.every((r) => !r.success);
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
  } {
    const total = this.records.length;
    const successful = this.records.filter((r) => r.success).length;
    const failed = total - successful;
    const successRate = total > 0 ? successful / total : 0;
    const avgDurationMs = total > 0 ? this.records.reduce((sum, r) => sum + r.durationMs, 0) / total : 0;

    return { total, successful, failed, successRate, avgDurationMs };
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }
}
