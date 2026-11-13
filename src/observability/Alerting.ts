/**
 * Alerting Manager
 *
 * Monitors metrics and logs, triggers alerts based on rules.
 * Supports multiple notification channels (Email, Slack, PagerDuty, etc.)
 */

import { logger } from '../utils/logger.js';
import type { HealthReport } from '../reliability/HealthChecker.js';

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface Alert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;
  metadata?: Record<string, any>;
  fingerprint?: string; // For deduplication
}

export interface AlertRule {
  name: string;
  condition: (data: any) => boolean;
  severity: AlertSeverity;
  message: string;
  cooldown?: number; // Milliseconds before re-alerting
}

export interface AlertChannel {
  type: 'console' | 'email' | 'slack' | 'pagerduty' | 'webhook';
  config: Record<string, any>;
}

export interface AlertingOptions {
  suppressWindow?: number; // Milliseconds to suppress duplicate alerts
  channels?: AlertChannel[];
}

/**
 * Alerting Manager for monitoring and notifications
 */
export class AlertingManager {
  private rules = new Map<string, AlertRule>();
  private channels: AlertChannel[] = [];
  private alertHistory = new Map<string, number>(); // fingerprint -> last alert time
  private suppressWindow: number;

  constructor(options: AlertingOptions = {}) {
    this.suppressWindow = options.suppressWindow ?? 300_000; // 5 minutes default
    this.channels = options.channels || [{ type: 'console', config: {} }];
    this.registerDefaultRules();
  }

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.name, rule);
    logger.info(`[Alerting] Registered alert rule: ${rule.name}`);
  }

  /**
   * Remove an alert rule
   */
  removeRule(name: string): void {
    this.rules.delete(name);
    logger.info(`[Alerting] Removed alert rule: ${name}`);
  }

  /**
   * Add a notification channel
   */
  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
    logger.info(`[Alerting] Added notification channel: ${channel.type}`);
  }

  /**
   * Evaluate all rules against data
   */
  async evaluate(data: any): Promise<void> {
    for (const [name, rule] of this.rules.entries()) {
      try {
        if (rule.condition(data)) {
          const alert: Alert = {
            id: this.generateId(),
            timestamp: Date.now(),
            severity: rule.severity,
            title: name,
            message: rule.message,
            source: 'rule_evaluation',
            metadata: { rule: name, data },
            fingerprint: this.generateFingerprint(name, rule.message),
          };

          await this.sendAlert(alert);
        }
      } catch (error) {
        logger.error(`[Alerting] Failed to evaluate rule '${name}':`, error);
      }
    }
  }

  /**
   * Send an alert through all channels
   */
  async sendAlert(alert: Alert, channels?: AlertChannel[]): Promise<void> {
    // Check for duplicates
    if (this.shouldSuppress(alert)) {
      logger.debug(`[Alerting] Alert suppressed (duplicate): ${alert.title}`);
      return;
    }

    const targetChannels = channels || this.channels;

    logger.info(`[Alerting] Sending ${alert.severity} alert: ${alert.title}`);

    for (const channel of targetChannels) {
      try {
        await this.sendToChannel(alert, channel);
      } catch (error) {
        logger.error(`[Alerting] Failed to send alert to ${channel.type}:`, error);
      }
    }

    // Record alert for deduplication
    if (alert.fingerprint) {
      this.alertHistory.set(alert.fingerprint, alert.timestamp);
    }
  }

  /**
   * Send alert to a specific channel
   */
  private async sendToChannel(alert: Alert, channel: AlertChannel): Promise<void> {
    switch (channel.type) {
      case 'console':
        this.sendToConsole(alert);
        break;

      case 'email':
        await this.sendToEmail(alert, channel.config);
        break;

      case 'slack':
        await this.sendToSlack(alert, channel.config);
        break;

      case 'pagerduty':
        await this.sendToPagerDuty(alert, channel.config);
        break;

      case 'webhook':
        await this.sendToWebhook(alert, channel.config);
        break;

      default:
        logger.warn(`[Alerting] Unknown channel type: ${channel.type}`);
    }
  }

  /**
   * Send to console
   */
  private sendToConsole(alert: Alert): void {
    const icon = this.getSeverityIcon(alert.severity);
    const timestamp = new Date(alert.timestamp).toISOString();

    console.log(`\n${icon} ALERT [${alert.severity.toUpperCase()}] ${icon}`);
    console.log(`Time: ${timestamp}`);
    console.log(`Title: ${alert.title}`);
    console.log(`Message: ${alert.message}`);
    if (alert.metadata) {
      console.log(`Metadata:`, JSON.stringify(alert.metadata, null, 2));
    }
    console.log('');
  }

  /**
   * Send to Email (placeholder)
   */
  private async sendToEmail(alert: Alert, config: Record<string, unknown>): Promise<void> {
    // Placeholder for actual email implementation
    logger.info(`[Alerting] Would send email to ${config.to}: ${alert.title}`);
    // Example using nodemailer:
    // const transporter = nodemailer.createTransport(config.smtp);
    // await transporter.sendMail({
    //   from: config.from,
    //   to: config.to,
    //   subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    //   text: alert.message,
    //   html: this.formatAlertHTML(alert)
    // });
  }

  /**
   * Send to Slack (placeholder)
   */
  private async sendToSlack(alert: Alert, config: Record<string, any>): Promise<void> {
    // Placeholder for actual Slack implementation
    logger.info(`[Alerting] Would send Slack message to ${config.webhook}: ${alert.title}`);
    // Example:
    // await fetch(config.webhook, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     text: `*${alert.severity.toUpperCase()}*: ${alert.title}`,
    //     attachments: [{
    //       text: alert.message,
    //       color: this.getSeverityColor(alert.severity)
    //     }]
    //   })
    // });
  }

  /**
   * Send to PagerDuty (placeholder)
   */
  private async sendToPagerDuty(alert: Alert, config: Record<string, any>): Promise<void> {
    // Placeholder for actual PagerDuty implementation
    logger.info(`[Alerting] Would send PagerDuty event: ${alert.title}`);
    // Example:
    // await fetch('https://events.pagerduty.com/v2/enqueue', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     routing_key: config.integrationKey,
    //     event_action: 'trigger',
    //     payload: {
    //       summary: alert.title,
    //       severity: alert.severity,
    //       source: alert.source,
    //       custom_details: alert.metadata
    //     }
    //   })
    // });
  }

  /**
   * Send to generic webhook
   */
  private async sendToWebhook(alert: Alert, config: Record<string, any>): Promise<void> {
    logger.info(`[Alerting] Would send webhook to ${config.url}: ${alert.title}`);
    // Example:
    // await fetch(config.url, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     ...(config.headers || {})
    //   },
    //   body: JSON.stringify(alert)
    // });
  }

  /**
   * Check if alert should be suppressed
   */
  private shouldSuppress(alert: Alert): boolean {
    if (!alert.fingerprint) return false;

    const lastAlertTime = this.alertHistory.get(alert.fingerprint);
    if (!lastAlertTime) return false;

    return Date.now() - lastAlertTime < this.suppressWindow;
  }

  /**
   * Generate unique alert ID
   */
  private generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate fingerprint for deduplication
   */
  private generateFingerprint(title: string, message: string): string {
    return `${title}:${message}`;
  }

  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: AlertSeverity): string {
    const icons = {
      [AlertSeverity.INFO]: 'ℹ️',
      [AlertSeverity.WARNING]: '⚠️',
      [AlertSeverity.ERROR]: '❌',
      [AlertSeverity.CRITICAL]: '🚨',
    };
    return icons[severity] || '📢';
  }

  /**
   * Get severity color for Slack (unused but kept for future use)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _getSeverityColor(severity: AlertSeverity): string {
    const colors = {
      [AlertSeverity.INFO]: '#36a64f',
      [AlertSeverity.WARNING]: '#ff9900',
      [AlertSeverity.ERROR]: '#ff0000',
      [AlertSeverity.CRITICAL]: '#8b0000',
    };
    return colors[severity] || '#808080';
  }

  /**
   * Register default alert rules
   */
  private registerDefaultRules(): void {
    // High memory usage
    this.addRule({
      name: 'high_memory_usage',
      condition: (data: HealthReport) => {
        const memCheck = data.checks?.memory;
        return memCheck?.status === 'unhealthy';
      },
      severity: AlertSeverity.WARNING,
      message: 'System memory usage is critically high',
    });

    // Service unhealthy
    this.addRule({
      name: 'service_unhealthy',
      condition: (data: HealthReport) => {
        return data.status === 'unhealthy';
      },
      severity: AlertSeverity.CRITICAL,
      message: 'Service health check failed',
    });

    // High error rate
    this.addRule({
      name: 'high_error_rate',
      condition: (data: any) => {
        if (data.metrics?.error_rate !== undefined) {
          return data.metrics.error_rate > 0.1; // 10%
        }
        return false;
      },
      severity: AlertSeverity.ERROR,
      message: 'Error rate exceeds threshold (>10%)',
    });
  }

  /**
   * Clear old alert history
   */
  pruneHistory(): void {
    const now = Date.now();
    for (const [fingerprint, timestamp] of this.alertHistory.entries()) {
      if (now - timestamp > this.suppressWindow * 2) {
        this.alertHistory.delete(fingerprint);
      }
    }
  }
}

// Singleton instance
export const alertingManager = new AlertingManager();
