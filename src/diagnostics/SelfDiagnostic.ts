/**
 * SelfDiagnostic — 自我诊断系统
 *
 * 功能：
 * - 检查环境配置
 * - 验证 LLM 连接
 * - 测试工具可用性
 * - 检查文件系统权限
 * - 生成诊断报告
 */

import { config } from '../agent/config.js';
import { createLLMClient } from '../agent/LLMClient.js';
import { getAllTools } from '../tools/registry.js';
import fs from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DiagnosticResult {
  category: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

export interface HealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  environment: DiagnosticResult[];
  llm: DiagnosticResult[];
  tools: DiagnosticResult[];
  filesystem: DiagnosticResult[];
  network: DiagnosticResult[];
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
  };
}

export class SelfDiagnostic {
  /**
   * 运行完整的健康检查
   */
  async runHealthCheck(): Promise<HealthReport> {
    const results: DiagnosticResult[] = [];

    // 检查各个方面
    const envResults = await this.checkEnvironment();
    const llmResults = await this.checkLLM();
    const toolResults = await this.checkTools();
    const fsResults = await this.checkFileSystem();
    const netResults = await this.checkNetwork();

    results.push(...envResults, ...llmResults, ...toolResults, ...fsResults, ...netResults);

    // 统计
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      warned: results.filter((r) => r.status === 'warn').length,
      failed: results.filter((r) => r.status === 'fail').length,
    };

    // 判断整体状态
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (summary.failed === 0 && summary.warned === 0) {
      overall = 'healthy';
    } else if (summary.failed === 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      timestamp: Date.now(),
      environment: envResults,
      llm: llmResults,
      tools: toolResults,
      filesystem: fsResults,
      network: netResults,
      summary,
    };
  }

  /**
   * 检查环境配置
   */
  async checkEnvironment(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // Node.js 版本
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    results.push({
      category: 'environment',
      name: 'Node.js Version',
      status: majorVersion >= 18 ? 'pass' : 'fail',
      message: `Node.js ${nodeVersion}`,
      suggestion: majorVersion < 18 ? 'Please upgrade to Node.js 18 or higher' : undefined,
      details: { version: nodeVersion, required: '>=18.0.0' },
    });

    // 操作系统
    results.push({
      category: 'environment',
      name: 'Operating System',
      status: 'pass',
      message: `${os.platform()} ${os.release()}`,
      details: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
      },
    });

    // 内存
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercent = ((totalMem - freeMem) / totalMem) * 100;
    results.push({
      category: 'environment',
      name: 'Memory',
      status: usedMemPercent > 90 ? 'warn' : 'pass',
      message: `${(freeMem / 1024 / 1024 / 1024).toFixed(1)}GB free of ${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB`,
      suggestion: usedMemPercent > 90 ? 'High memory usage detected' : undefined,
      details: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        usedPercent: usedMemPercent.toFixed(1),
      },
    });

    // 环境变量
    const hasApiKey = !!config.apiKey;
    results.push({
      category: 'environment',
      name: 'API Key',
      status: hasApiKey ? 'pass' : 'fail',
      message: hasApiKey ? 'API key configured' : 'API key not found',
      suggestion: hasApiKey ? undefined : 'Set CODEYANG_API_KEY environment variable',
    });

    return results;
  }

  /**
   * 检查 LLM 连接
   */
  async checkLLM(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 配置检查
    results.push({
      category: 'llm',
      name: 'LLM Provider',
      status: 'pass',
      message: config.provider,
      details: {
        provider: config.provider,
        model: config.model,
        baseURL: config.baseURL,
      },
    });

    // 连接测试（如果有 API key）
    if (config.apiKey) {
      try {
        const client = createLLMClient(config.provider, config.apiKey, config.baseURL);
        // 简单测试（不实际调用 API，只检查客户端创建）
        // A provider that cannot build a client will also fail its first real
        // call, so this catches bad provider names before the first turn.
        const streamable = typeof client?.stream === 'function';
        results.push({
          category: 'llm',
          name: 'LLM Client',
          status: streamable ? 'pass' : 'warn',
          message: streamable
            ? 'LLM client initialized successfully'
            : 'LLM client was created but exposes no stream() method',
          suggestion: streamable ? undefined : 'Check that the configured provider is supported',
        });
      } catch (error) {
        results.push({
          category: 'llm',
          name: 'LLM Client',
          status: 'fail',
          message: 'Failed to initialize LLM client',
          suggestion: 'Check your API key and provider configuration',
          details: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    } else {
      results.push({
        category: 'llm',
        name: 'LLM Connection',
        status: 'fail',
        message: 'Cannot test connection without API key',
        suggestion: 'Set CODEYANG_API_KEY to test LLM connection',
      });
    }

    return results;
  }

  /**
   * 检查工具可用性
   */
  async checkTools(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const tools = getAllTools();

      results.push({
        category: 'tools',
        name: 'Tool Registry',
        status: 'pass',
        message: `${tools.length} tools registered`,
        details: { count: tools.length, tools: tools.map((t) => t.name) },
      });

      // 检查关键工具
      const criticalTools = ['Read', 'Write', 'Edit', 'BashTool', 'GitTool'];
      for (const toolName of criticalTools) {
        const tool = tools.find((t) => t.name === toolName);
        results.push({
          category: 'tools',
          name: `Tool: ${toolName}`,
          status: tool ? 'pass' : 'warn',
          message: tool ? 'Available' : 'Not found',
          suggestion: tool ? undefined : `${toolName} is missing from registry`,
        });
      }
    } catch (error) {
      results.push({
        category: 'tools',
        name: 'Tool Registry',
        status: 'fail',
        message: 'Failed to access tool registry',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    return results;
  }

  /**
   * 检查文件系统
   */
  async checkFileSystem(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 检查当前目录读写权限
    const cwd = process.cwd();
    try {
      await fs.access(cwd, fs.constants.R_OK | fs.constants.W_OK);
      results.push({
        category: 'filesystem',
        name: 'Working Directory',
        status: 'pass',
        message: `${cwd} is readable and writable`,
        details: { cwd },
      });
    } catch (error) {
      results.push({
        category: 'filesystem',
        name: 'Working Directory',
        status: 'fail',
        message: 'No read/write access to current directory',
        suggestion: 'Check directory permissions',
        details: { cwd, error: error instanceof Error ? error.message : String(error) },
      });
    }

    // 检查临时目录
    const tmpDir = os.tmpdir();
    try {
      await fs.access(tmpDir, fs.constants.R_OK | fs.constants.W_OK);
      results.push({
        category: 'filesystem',
        name: 'Temp Directory',
        status: 'pass',
        message: `${tmpDir} is accessible`,
        details: { tmpDir },
      });
    } catch (error) {
      results.push({
        category: 'filesystem',
        name: 'Temp Directory',
        status: 'warn',
        message: 'Cannot access temp directory',
        details: { tmpDir, error: error instanceof Error ? error.message : String(error) },
      });
    }

    // 检查磁盘空间（仅在支持的平台）
    try {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        const { stdout } = await execAsync('df -h .');
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          const usePercent = parseInt(parts[4]);
          results.push({
            category: 'filesystem',
            name: 'Disk Space',
            status: usePercent > 90 ? 'warn' : 'pass',
            message: `${parts[3]} available (${parts[4]} used)`,
            suggestion: usePercent > 90 ? 'Low disk space' : undefined,
          });
        }
      }
    } catch {
      // Ignore disk space check failures
    }

    return results;
  }

  /**
   * 检查网络连接
   */
  async checkNetwork(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 检查网络接口
    const interfaces = os.networkInterfaces();
    const hasNetwork = Object.values(interfaces).some((iface) => iface?.some((addr) => !addr.internal));

    results.push({
      category: 'network',
      name: 'Network Interface',
      status: hasNetwork ? 'pass' : 'warn',
      message: hasNetwork ? 'Network interfaces available' : 'No external network interfaces found',
      suggestion: hasNetwork ? undefined : 'Check network connection',
    });

    // 检查 DNS 解析（测试基本连通性）
    try {
      const dns = await import('dns/promises');
      await dns.resolve('api.deepseek.com');
      results.push({
        category: 'network',
        name: 'DNS Resolution',
        status: 'pass',
        message: 'DNS resolution working',
      });
    } catch (error) {
      results.push({
        category: 'network',
        name: 'DNS Resolution',
        status: 'warn',
        message: 'DNS resolution may be unavailable',
        suggestion: 'Check internet connection',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    return results;
  }

  /**
   * 生成格式化的诊断报告
   */
  formatReport(report: HealthReport): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('CodeYang Health Check Report');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
    lines.push(`Overall Status: ${report.overall.toUpperCase()}`);
    lines.push('');
    lines.push('Summary');
    lines.push('-'.repeat(60));
    lines.push(`Total Checks: ${report.summary.total}`);
    lines.push(`✓ Passed: ${report.summary.passed}`);
    lines.push(`⚠ Warnings: ${report.summary.warned}`);
    lines.push(`✗ Failed: ${report.summary.failed}`);
    lines.push('');

    const categories = ['environment', 'llm', 'tools', 'filesystem', 'network'];
    const categoryNames: Record<string, string> = {
      environment: 'Environment',
      llm: 'LLM Connection',
      tools: 'Tools',
      filesystem: 'File System',
      network: 'Network',
    };

    for (const category of categories) {
      const categoryResults =
        category === 'environment'
          ? report.environment
          : category === 'llm'
            ? report.llm
            : category === 'tools'
              ? report.tools
              : category === 'filesystem'
                ? report.filesystem
                : report.network;

      if (categoryResults.length > 0) {
        lines.push(categoryNames[category]);
        lines.push('-'.repeat(60));
        for (const result of categoryResults) {
          const icon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
          lines.push(`${icon} ${result.name}: ${result.message}`);
          if (result.suggestion) {
            lines.push(`  → ${result.suggestion}`);
          }
        }
        lines.push('');
      }
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}
