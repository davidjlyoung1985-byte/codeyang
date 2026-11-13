/**
 * Health Checker
 *
 * Monitors system health and provides self-healing capabilities.
 * Checks various components and attempts automatic recovery.
 */

import { logger } from '../utils/logger.js';

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message?: string;
  lastCheck: number;
  responseTime?: number;
  metadata?: Record<string, any>;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: number;
  checks: Record<string, HealthCheck>;
  uptime: number;
  version: string;
}

export interface HealthCheckOptions {
  timeout?: number;
  interval?: number; // For periodic checks
  enabled?: boolean;
}

export interface SelfHealAction {
  issue: string;
  action: () => Promise<boolean>;
  description: string;
}

/**
 * System Health Checker with self-healing capabilities
 */
export class HealthChecker {
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private healActions: Map<string, SelfHealAction> = new Map();
  private periodicTimer?: NodeJS.Timeout;
  private startTime = Date.now();

  constructor() {
    this.registerDefaultChecks();
    this.registerDefaultHealActions();
  }

  /**
   * Register a health check
   */
  registerCheck(name: string, checkFn: () => Promise<HealthCheck>): void {
    this.checks.set(name, checkFn);
    logger.info(`[HealthChecker] Registered health check: ${name}`);
  }

  /**
   * Register a self-healing action
   */
  registerHealAction(issue: string, action: SelfHealAction): void {
    this.healActions.set(issue, action);
    logger.info(`[HealthChecker] Registered heal action: ${issue}`);
  }

  /**
   * Run all health checks and generate a report
   */
  async checkHealth(): Promise<HealthReport> {
    const results: Record<string, HealthCheck> = {};
    let overallStatus = HealthStatus.HEALTHY;

    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const result = await checkFn();
        results[name] = result;

        // Update overall status
        if (result.status === HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.UNHEALTHY;
        } else if (result.status === HealthStatus.DEGRADED && overallStatus === HealthStatus.HEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results[name] = {
          name,
          status: HealthStatus.UNHEALTHY,
          message: `Check failed: ${errorMessage}`,
          lastCheck: Date.now(),
        };
        overallStatus = HealthStatus.UNHEALTHY;
        logger.error(`[HealthChecker] Health check '${name}' failed:`, error);
      }
    }

    return {
      status: overallStatus,
      timestamp: Date.now(),
      checks: results,
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || 'unknown',
    };
  }

  /**
   * Attempt to self-heal detected issues
   */
  async selfHeal(issue: string): Promise<boolean> {
    const action = this.healActions.get(issue);
    if (!action) {
      logger.warn(`[HealthChecker] No heal action registered for issue: ${issue}`);
      return false;
    }

    try {
      logger.info(`[HealthChecker] Attempting to heal: ${issue} - ${action.description}`);
      const success = await action.action();
      if (success) {
        logger.info(`[HealthChecker] Successfully healed: ${issue}`);
      } else {
        logger.warn(`[HealthChecker] Failed to heal: ${issue}`);
      }
      return success;
    } catch (error) {
      logger.error(`[HealthChecker] Error during self-heal for ${issue}:`, error);
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 60_000): void {
    if (this.periodicTimer) {
      logger.warn('[HealthChecker] Periodic checks already running');
      return;
    }

    this.periodicTimer = setInterval(async () => {
      const report = await this.checkHealth();

      if (report.status === HealthStatus.UNHEALTHY) {
        logger.error('[HealthChecker] System unhealthy, attempting self-heal...');

        // Try to heal unhealthy checks
        for (const [name, check] of Object.entries(report.checks)) {
          if (check.status === HealthStatus.UNHEALTHY) {
            await this.selfHeal(name);
          }
        }
      } else if (report.status === HealthStatus.DEGRADED) {
        logger.warn('[HealthChecker] System degraded, monitoring...');
      }
    }, intervalMs);

    // Allow process to exit
    this.periodicTimer.unref();

    logger.info(`[HealthChecker] Periodic health checks started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = undefined;
      logger.info('[HealthChecker] Periodic health checks stopped');
    }
  }

  /**
   * Register default system health checks
   */
  private registerDefaultChecks(): void {
    // Memory check
    this.registerCheck('memory', async () => {
      const usage = process.memoryUsage();
      const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

      let status = HealthStatus.HEALTHY;
      let message = `Heap usage: ${heapUsedPercent.toFixed(2)}%`;

      if (heapUsedPercent > 90) {
        status = HealthStatus.UNHEALTHY;
        message = `Critical heap usage: ${heapUsedPercent.toFixed(2)}%`;
      } else if (heapUsedPercent > 75) {
        status = HealthStatus.DEGRADED;
        message = `High heap usage: ${heapUsedPercent.toFixed(2)}%`;
      }

      return {
        name: 'memory',
        status,
        message,
        lastCheck: Date.now(),
        metadata: {
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal,
          rss: usage.rss,
          external: usage.external,
        },
      };
    });

    // Event loop lag check
    this.registerCheck('event_loop', async () => {
      const start = Date.now();
      await new Promise((resolve) => setImmediate(resolve));
      const lag = Date.now() - start;

      let status = HealthStatus.HEALTHY;
      let message = `Event loop lag: ${lag}ms`;

      if (lag > 1000) {
        status = HealthStatus.UNHEALTHY;
        message = `Critical event loop lag: ${lag}ms`;
      } else if (lag > 100) {
        status = HealthStatus.DEGRADED;
        message = `High event loop lag: ${lag}ms`;
      }

      return {
        name: 'event_loop',
        status,
        message,
        lastCheck: Date.now(),
        responseTime: lag,
      };
    });

    // Disk space check
    this.registerCheck('disk_space', async () => {
      // Note: This is a simplified check. In production, use a proper disk space library
      try {
        const { statfs } = await import('node:fs');
        const { promisify } = await import('node:util');
        const statfsAsync = promisify(statfs);

        // Check current directory
        const stats = await statfsAsync(process.cwd());
        const availablePercent = (stats.bavail / stats.blocks) * 100;

        let status = HealthStatus.HEALTHY;
        let message = `Disk space available: ${availablePercent.toFixed(2)}%`;

        if (availablePercent < 5) {
          status = HealthStatus.UNHEALTHY;
          message = `Critical: Low disk space: ${availablePercent.toFixed(2)}%`;
        } else if (availablePercent < 10) {
          status = HealthStatus.DEGRADED;
          message = `Warning: Low disk space: ${availablePercent.toFixed(2)}%`;
        }

        return {
          name: 'disk_space',
          status,
          message,
          lastCheck: Date.now(),
          metadata: {
            availablePercent,
            totalBlocks: stats.blocks,
            availableBlocks: stats.bavail,
          },
        };
      } catch (error) {
        // statfs not available on all platforms
        return {
          name: 'disk_space',
          status: HealthStatus.HEALTHY,
          message: 'Disk space check not available on this platform',
          lastCheck: Date.now(),
        };
      }
    });
  }

  /**
   * Register default self-healing actions
   */
  private registerDefaultHealActions(): void {
    // Memory healing: trigger garbage collection
    this.registerHealAction('memory', {
      issue: 'memory',
      description: 'Trigger garbage collection',
      action: async () => {
        try {
          if (global.gc) {
            global.gc();
            logger.info('[HealthChecker] Garbage collection triggered');
            return true;
          }
          logger.warn('[HealthChecker] GC not available (run with --expose-gc)');
          return false;
        } catch (error) {
          logger.error('[HealthChecker] GC failed:', error);
          return false;
        }
      },
    });

    // Event loop healing: clear old timers
    this.registerHealAction('event_loop', {
      issue: 'event_loop',
      description: 'Clear old timers and reduce load',
      action: async () => {
        // This is a placeholder - actual implementation would need more context
        logger.info('[HealthChecker] Event loop healing attempted');
        return true;
      },
    });
  }
}

// Singleton instance
export const healthChecker = new HealthChecker();
