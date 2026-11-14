/**
 * Web Console Server
 *
 * Express server providing:
 * - REST API for database queries
 * - WebSocket for real-time updates
 * - Static file serving for React app
 */

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { databaseManager } from '../database/DatabaseManager.js';
import { backupManager } from '../database/BackupManager.js';
import { metricsCollector } from '../observability/MetricsCollector.js';
import { logger } from '../utils/logger.js';

export interface WebConsoleConfig {
  port: number;
  host: string;
  corsOrigin?: string;
}

export class WebConsoleServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private config: WebConsoleConfig;

  constructor(config: WebConsoleConfig = { port: 3000, host: '127.0.0.1' }) {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());

    // CORS
    if (this.config.corsOrigin) {
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', this.config.corsOrigin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
      });
    }

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`[WebConsole] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup REST API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: Date.now() });
    });

    // Statistics
    this.app.get('/api/stats', async (req, res) => {
      try {
        const dbStats = await databaseManager.getStatistics();
        const metrics = metricsCollector.getSnapshot();

        res.json({
          database: dbStats,
          metrics: metrics,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        });
      } catch (error) {
        logger.error('[WebConsole] Failed to get stats:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
      }
    });

    // Sessions
    this.app.get('/api/sessions', async (req, res) => {
      try {
        const userId = req.query.userId as string | undefined;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const sessions = await databaseManager.listSessions(userId, limit, offset);
        res.json({ sessions, total: sessions.length });
      } catch (error) {
        logger.error('[WebConsole] Failed to list sessions:', error);
        res.status(500).json({ error: 'Failed to list sessions' });
      }
    });

    this.app.get('/api/sessions/:id', async (req, res) => {
      try {
        const session = await databaseManager.getSession(req.params.id);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        res.json(session);
      } catch (error) {
        logger.error('[WebConsole] Failed to get session:', error);
        res.status(500).json({ error: 'Failed to get session' });
      }
    });

    // Messages
    this.app.get('/api/sessions/:id/messages', async (req, res) => {
      try {
        const messages = await databaseManager.getMessages(req.params.id);
        res.json({ messages });
      } catch (error) {
        logger.error('[WebConsole] Failed to get messages:', error);
        res.status(500).json({ error: 'Failed to get messages' });
      }
    });

    // Search
    this.app.get('/api/search', async (req, res) => {
      try {
        const query = req.query.q as string;
        if (!query) {
          return res.status(400).json({ error: 'Query parameter required' });
        }

        const messages = await databaseManager.searchMessages(query);
        res.json({ messages, total: messages.length });
      } catch (error) {
        logger.error('[WebConsole] Search failed:', error);
        res.status(500).json({ error: 'Search failed' });
      }
    });

    // Backups
    this.app.get('/api/backups', async (req, res) => {
      try {
        const backups = await backupManager.listBackups();
        res.json({ backups });
      } catch (error) {
        logger.error('[WebConsole] Failed to list backups:', error);
        res.status(500).json({ error: 'Failed to list backups' });
      }
    });

    this.app.post('/api/backups', async (req, res) => {
      try {
        const type = (req.body.type || 'full') as 'full' | 'incremental';
        const backup = await backupManager.createBackup(type);
        res.json({ backup });
      } catch (error) {
        logger.error('[WebConsole] Failed to create backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
      }
    });

    this.app.post('/api/backups/:id/restore', async (req, res) => {
      try {
        await backupManager.restore(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('[WebConsole] Failed to restore backup:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
      }
    });

    // Metrics
    this.app.get('/api/metrics', (req, res) => {
      const snapshot = metricsCollector.getSnapshot();
      res.json(snapshot);
    });
  }

  /**
   * Setup WebSocket for real-time updates
   */
  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      logger.info('[WebConsole] WebSocket client connected');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          logger.error('[WebConsole] Invalid WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        logger.info('[WebConsole] WebSocket client disconnected');
      });

      // Send initial data
      ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
    });

    // Broadcast updates periodically
    setInterval(() => {
      this.broadcast({ type: 'metrics', data: metricsCollector.getSnapshot() });
    }, 5000); // Every 5 seconds
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(ws: any, message: any): void {
    switch (message.type) {
      case 'subscribe':
        // Subscribe to specific events
        logger.debug(`[WebConsole] Client subscribed to: ${message.channel}`);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        logger.warn(`[WebConsole] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(data);
      }
    });
  }

  /**
   * Start server
   */
  async start(): Promise<void> {
    // Ensure database is connected
    if (!databaseManager) {
      await databaseManager.connect();
    }

    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(`[WebConsole] Server running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          logger.info('[WebConsole] Server stopped');
          resolve();
        });
      });
    });
  }
}

// Singleton instance
export const webConsoleServer = new WebConsoleServer();
