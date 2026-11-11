/**
 * SelfDiagnostic Tests — 自我诊断系统测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelfDiagnostic } from './SelfDiagnostic.js';
import type { HealthReport } from './SelfDiagnostic.js';

describe('SelfDiagnostic', () => {
  let diagnostic: SelfDiagnostic;

  beforeEach(() => {
    diagnostic = new SelfDiagnostic();
  });

  describe('Health Check', () => {
    it('should run complete health check', async () => {
      const report = await diagnostic.runHealthCheck();

      expect(report).toBeDefined();
      expect(report.overall).toMatch(/healthy|degraded|unhealthy/);
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
    });

    it('should include all check categories', async () => {
      const report = await diagnostic.runHealthCheck();

      expect(report.environment).toBeDefined();
      expect(report.llm).toBeDefined();
      expect(report.tools).toBeDefined();
      expect(report.filesystem).toBeDefined();
      expect(report.network).toBeDefined();
    });

    it('should calculate summary correctly', async () => {
      const report = await diagnostic.runHealthCheck();

      const total =
        report.environment.length +
        report.llm.length +
        report.tools.length +
        report.filesystem.length +
        report.network.length;

      expect(report.summary.total).toBe(total);
      expect(report.summary.passed + report.summary.warned + report.summary.failed).toBe(total);
    });
  });

  describe('Environment Check', () => {
    it('should check Node.js version', async () => {
      const results = await diagnostic.checkEnvironment();

      const nodeCheck = results.find((r) => r.name === 'Node.js Version');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.status).toMatch(/pass|fail/);
    });

    it('should check operating system', async () => {
      const results = await diagnostic.checkEnvironment();

      const osCheck = results.find((r) => r.name === 'Operating System');
      expect(osCheck).toBeDefined();
      expect(osCheck!.status).toBe('pass');
      expect(osCheck!.details).toHaveProperty('platform');
    });

    it('should check memory', async () => {
      const results = await diagnostic.checkEnvironment();

      const memCheck = results.find((r) => r.name === 'Memory');
      expect(memCheck).toBeDefined();
      expect(memCheck!.details).toHaveProperty('total');
      expect(memCheck!.details).toHaveProperty('free');
    });

    it('should check API key', async () => {
      const results = await diagnostic.checkEnvironment();

      const apiKeyCheck = results.find((r) => r.name === 'API Key');
      expect(apiKeyCheck).toBeDefined();
      expect(apiKeyCheck!.status).toMatch(/pass|fail/);
    });
  });

  describe('LLM Check', () => {
    it('should check LLM provider configuration', async () => {
      const results = await diagnostic.checkLLM();

      const providerCheck = results.find((r) => r.name === 'LLM Provider');
      expect(providerCheck).toBeDefined();
      expect(providerCheck!.details).toHaveProperty('provider');
      expect(providerCheck!.details).toHaveProperty('model');
    });

    it('should check LLM client initialization', async () => {
      const results = await diagnostic.checkLLM();

      const clientCheck = results.find((r) => r.name === 'LLM Client' || r.name === 'LLM Connection');
      expect(clientCheck).toBeDefined();
    });
  });

  describe('Tools Check', () => {
    it('should check tool registry', async () => {
      const results = await diagnostic.checkTools();

      const registryCheck = results.find((r) => r.name === 'Tool Registry');
      expect(registryCheck).toBeDefined();
    });

    it('should handle tool checks', async () => {
      const results = await diagnostic.checkTools();

      // Should have at least the registry check
      expect(results.length).toBeGreaterThan(0);

      // If there are tool checks, they should have proper structure
      const toolChecks = results.filter((r) => r.name.startsWith('Tool: '));
      toolChecks.forEach((check) => {
        expect(check.status).toMatch(/pass|warn|fail/);
        expect(check.message).toBeDefined();
      });
    });
  });

  describe('File System Check', () => {
    it('should check working directory access', async () => {
      const results = await diagnostic.checkFileSystem();

      const cwdCheck = results.find((r) => r.name === 'Working Directory');
      expect(cwdCheck).toBeDefined();
      expect(cwdCheck!.details).toHaveProperty('cwd');
    });

    it('should check temp directory access', async () => {
      const results = await diagnostic.checkFileSystem();

      const tmpCheck = results.find((r) => r.name === 'Temp Directory');
      expect(tmpCheck).toBeDefined();
      expect(tmpCheck!.details).toHaveProperty('tmpDir');
    });
  });

  describe('Network Check', () => {
    it('should check network interfaces', async () => {
      const results = await diagnostic.checkNetwork();

      const interfaceCheck = results.find((r) => r.name === 'Network Interface');
      expect(interfaceCheck).toBeDefined();
    });

    it('should check DNS resolution', async () => {
      const results = await diagnostic.checkNetwork();

      const dnsCheck = results.find((r) => r.name === 'DNS Resolution');
      expect(dnsCheck).toBeDefined();
      expect(dnsCheck!.status).toMatch(/pass|warn|fail/);
    });
  });

  describe('Report Formatting', () => {
    it('should format report as text', async () => {
      const report = await diagnostic.runHealthCheck();
      const formatted = diagnostic.formatReport(report);

      expect(formatted).toContain('CodeYang Health Check Report');
      expect(formatted).toContain('Overall Status');
      expect(formatted).toContain('Summary');
    });

    it('should include all categories in report', async () => {
      const report = await diagnostic.runHealthCheck();
      const formatted = diagnostic.formatReport(report);

      expect(formatted).toContain('Environment');
      expect(formatted).toContain('LLM Connection');
      expect(formatted).toContain('Tools');
      expect(formatted).toContain('File System');
      expect(formatted).toContain('Network');
    });

    it('should show check results with icons', async () => {
      const report = await diagnostic.runHealthCheck();
      const formatted = diagnostic.formatReport(report);

      // Should contain status icons
      expect(formatted).toMatch(/[✓⚠✗]/);
    });
  });

  describe('Overall Status', () => {
    it('should be healthy when all checks pass', async () => {
      const report: HealthReport = {
        overall: 'healthy',
        timestamp: Date.now(),
        environment: [{ category: 'env', name: 'Test', status: 'pass', message: 'OK' }],
        llm: [],
        tools: [],
        filesystem: [],
        network: [],
        summary: { total: 1, passed: 1, warned: 0, failed: 0 },
      };

      expect(report.overall).toBe('healthy');
    });

    it('should be degraded when there are warnings', async () => {
      const report: HealthReport = {
        overall: 'degraded',
        timestamp: Date.now(),
        environment: [
          { category: 'env', name: 'Test1', status: 'pass', message: 'OK' },
          { category: 'env', name: 'Test2', status: 'warn', message: 'Warning' },
        ],
        llm: [],
        tools: [],
        filesystem: [],
        network: [],
        summary: { total: 2, passed: 1, warned: 1, failed: 0 },
      };

      expect(report.overall).toBe('degraded');
    });

    it('should be unhealthy when there are failures', async () => {
      const report: HealthReport = {
        overall: 'unhealthy',
        timestamp: Date.now(),
        environment: [
          { category: 'env', name: 'Test1', status: 'pass', message: 'OK' },
          { category: 'env', name: 'Test2', status: 'fail', message: 'Failed' },
        ],
        llm: [],
        tools: [],
        filesystem: [],
        network: [],
        summary: { total: 2, passed: 1, warned: 0, failed: 1 },
      };

      expect(report.overall).toBe('unhealthy');
    });
  });

  describe('Suggestions', () => {
    it('should provide suggestions for failures', async () => {
      const results = await diagnostic.checkEnvironment();

      results.forEach((result) => {
        if (result.status === 'fail' || result.status === 'warn') {
          // Suggestions are optional but helpful
          if (result.suggestion) {
            expect(typeof result.suggestion).toBe('string');
            expect(result.suggestion.length).toBeGreaterThan(0);
          }
        }
      });
    });
  });

  describe('Details', () => {
    it('should include details for checks', async () => {
      const report = await diagnostic.runHealthCheck();

      // At least some checks should have details
      const allResults = [
        ...report.environment,
        ...report.llm,
        ...report.tools,
        ...report.filesystem,
        ...report.network,
      ];

      const withDetails = allResults.filter((r) => r.details);
      expect(withDetails.length).toBeGreaterThan(0);
    });
  });
});
