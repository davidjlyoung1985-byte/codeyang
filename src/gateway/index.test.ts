import { describe, it, expect, beforeEach } from 'vitest';
import { Gateway, ApiKeyAuthProvider, TokenBucketRateLimiter, ConsoleAuditLogger, type Request } from './index.js';

describe('Gateway', () => {
  let gateway: Gateway;

  beforeEach(() => {
    gateway = new Gateway();
  });

  describe('Request handling', () => {
    it('should handle basic internal request', async () => {
      const req: Request = {
        id: 'test-1',
        source: 'internal',
        operation: 'test.op',
        payload: { data: 'test' },
        timestamp: Date.now(),
      };

      const result = await gateway.handle(req);

      expect(result.success).toBe(true);
      expect(result.requestId).toBe('test-1');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should create request with auto-generated ID', () => {
      const req = gateway.createRequest({
        source: 'cli',
        operation: 'test.op',
        payload: { data: 'test' },
      });

      expect(req.id).toBeDefined();
      expect(req.id.length).toBeGreaterThan(0);
      expect(req.source).toBe('cli');
      expect(req.operation).toBe('test.op');
      expect(req.timestamp).toBeGreaterThan(0);
    });

    it('should reject unauthenticated external requests', async () => {
      const req: Request = {
        id: 'test-2',
        source: 'cli',
        operation: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const result = await gateway.handle(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('should accept authenticated requests', async () => {
      const auth = new ApiKeyAuthProvider();
      auth.addKey('test-key');
      gateway.setAuthProvider(auth);

      const req: Request = {
        id: 'test-3',
        source: 'cli',
        operation: 'test',
        payload: {},
        auth: { apiKey: 'test-key' },
        timestamp: Date.now(),
      };

      const result = await gateway.handle(req);

      expect(result.success).toBe(true);
    });
  });

  describe('ApiKeyAuthProvider', () => {
    it('should allow internal requests without key', async () => {
      const auth = new ApiKeyAuthProvider();
      const req: Request = {
        id: 'auth-1',
        source: 'internal',
        operation: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const result = await auth.authenticate(req);

      expect(result.allowed).toBe(true);
      expect(result.userId).toBe('internal');
    });

    it('should reject requests without API key', async () => {
      const auth = new ApiKeyAuthProvider();
      const req: Request = {
        id: 'auth-2',
        source: 'cli',
        operation: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const result = await auth.authenticate(req);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Missing API key');
    });

    it('should reject invalid API key', async () => {
      const auth = new ApiKeyAuthProvider();
      auth.addKey('valid-key-123');

      const req: Request = {
        id: 'auth-3',
        source: 'cli',
        operation: 'test',
        payload: {},
        auth: { apiKey: 'invalid-key' },
        timestamp: Date.now(),
      };

      const result = await auth.authenticate(req);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid API key');
    });

    it('should accept valid API key', async () => {
      const auth = new ApiKeyAuthProvider();
      auth.addKey('valid-key-123');

      const req: Request = {
        id: 'auth-4',
        source: 'cli',
        operation: 'test',
        payload: {},
        auth: { apiKey: 'valid-key-123' },
        timestamp: Date.now(),
      };

      const result = await auth.authenticate(req);

      expect(result.allowed).toBe(true);
      expect(result.userId).toBeDefined();
    });

    it('should manage keys correctly', async () => {
      const auth = new ApiKeyAuthProvider();
      auth.addKey('key1');
      auth.addKey('key2');

      const req1: Request = {
        id: 'auth-5',
        source: 'cli',
        operation: 'test',
        payload: {},
        auth: { apiKey: 'key1' },
        timestamp: Date.now(),
      };

      expect((await auth.authenticate(req1)).allowed).toBe(true);

      auth.removeKey('key1');
      expect((await auth.authenticate(req1)).allowed).toBe(false);

      auth.setKeys(['key3', 'key4']);
      const req2: Request = {
        ...req1,
        auth: { apiKey: 'key2' },
      };
      expect((await auth.authenticate(req2)).allowed).toBe(false);

      const req3: Request = {
        ...req1,
        auth: { apiKey: 'key3' },
      };
      expect((await auth.authenticate(req3)).allowed).toBe(true);
    });
  });

  describe('TokenBucketRateLimiter', () => {
    it('should allow requests within limit', async () => {
      const limiter = new TokenBucketRateLimiter(10, 10);

      const result = await limiter.check('user1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeDefined();
      expect(result.limit).toBe(10);
    });

    it('should reject requests over burst limit', async () => {
      const limiter = new TokenBucketRateLimiter(1, 2);

      const r1 = await limiter.check('user2');
      const r2 = await limiter.check('user2');
      const r3 = await limiter.check('user2');

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(false);
      expect(r3.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track different keys independently', async () => {
      const limiter = new TokenBucketRateLimiter(1, 2);

      await limiter.check('user1');
      await limiter.check('user1');
      const result1 = await limiter.check('user1');

      const result2 = await limiter.check('user2');

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(true);
    });

    it('should refill tokens over time', async () => {
      const limiter = new TokenBucketRateLimiter(10, 2);

      await limiter.check('user3');
      await limiter.check('user3');
      const r1 = await limiter.check('user3');
      expect(r1.allowed).toBe(false);

      // Wait 150ms for refill (at 10 tokens/sec = 100ms per token)
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      const r2 = await limiter.check('user3');
      expect(r2.allowed).toBe(true);
    });
  });

  describe('ConsoleAuditLogger', () => {
    it('should log audit entries', async () => {
      const logger = new ConsoleAuditLogger();

      await logger.log({
        requestId: 'audit-1',
        source: 'cli',
        operation: 'test',
        timestamp: Date.now(),
        durationMs: 10,
        allowed: true,
      });

      const entries = logger.getRecent(10);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.requestId).toBe('audit-1');
    });

    it('should get stats correctly', async () => {
      const logger = new ConsoleAuditLogger();

      await logger.log({
        requestId: 'audit-1',
        source: 'cli',
        operation: 'test1',
        timestamp: Date.now(),
        durationMs: 10,
        allowed: true,
      });
      await logger.log({
        requestId: 'audit-2',
        source: 'cli',
        operation: 'test1',
        timestamp: Date.now(),
        durationMs: 20,
        allowed: true,
        error: 'Failed',
      });

      const stats = logger.getStats();
      expect(stats['test1']).toBeDefined();
      expect(stats['test1']?.total).toBe(2);
      expect(stats['test1']?.failed).toBe(1);
      expect(stats['test1']?.avgMs).toBe(15);
    });
  });

  describe('Middleware pipeline', () => {
    it('should execute middleware in order', async () => {
      const order: string[] = [];

      gateway.use(async (req, next) => {
        order.push('middleware1-before');
        const result = await next();
        order.push('middleware1-after');
        return result;
      });

      gateway.use(async (req, next) => {
        order.push('middleware2-before');
        const result = await next();
        order.push('middleware2-after');
        return result;
      });

      const req: Request = {
        id: 'mw-1',
        source: 'internal',
        operation: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      await gateway.handle(req);

      expect(order).toEqual(['middleware1-before', 'middleware2-before', 'middleware2-after', 'middleware1-after']);
    });

    it('should allow middleware to short-circuit', async () => {
      gateway.use((req) => {
        return Promise.resolve({
          success: false,
          error: 'Blocked by middleware',
          requestId: req.id,
          durationMs: 0,
        });
      });

      const req: Request = {
        id: 'mw-2',
        source: 'internal',
        operation: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const result = await gateway.handle(req);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Blocked by middleware');
    });
  });

  describe('Singleton pattern', () => {
    it('should return same instance', () => {
      const gw1 = Gateway.getInstance();
      const gw2 = Gateway.getInstance();

      expect(gw1).toBe(gw2);
    });
  });
});
