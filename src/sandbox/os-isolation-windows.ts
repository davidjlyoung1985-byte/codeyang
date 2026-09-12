/**
 * Windows网络隔离实现
 * 使用Windows Filtering Platform (WFP) 通过netsh防火墙规则
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';

export interface WindowsIsolationResult {
  supported: boolean;
  requiresAdmin: boolean;
  error?: string;
}

/**
 * 检测Windows防火墙是否可用
 */
export function detectWindowsFirewall(): WindowsIsolationResult {
  if (platform() !== 'win32') {
    return {
      supported: false,
      requiresAdmin: false,
      error: 'Not Windows platform',
    };
  }

  try {
    // 检查防火墙服务是否运行
    execSync('netsh advfirewall show currentprofile', {
      stdio: 'pipe',
      timeout: 5000,
    });

    // 检查是否有管理员权限
    try {
      execSync('net session', { stdio: 'pipe', timeout: 2000 });
      return {
        supported: true,
        requiresAdmin: false,
      };
    } catch {
      return {
        supported: true,
        requiresAdmin: true,
        error: 'Requires administrator privileges',
      };
    }
  } catch (err) {
    return {
      supported: false,
      requiresAdmin: false,
      error: 'Windows Firewall not available or not running',
    };
  }
}

/**
 * 创建防火墙规则阻塞特定进程的网络访问
 */
export function createNetworkBlockRule(processPath: string, ruleId: string): void {
  const ruleName = `CodeYang_Sandbox_${ruleId}`;

  try {
    // 删除可能存在的旧规则
    try {
      execSync(`netsh advfirewall firewall delete rule name="${ruleName}"`, {
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      // 忽略删除失败（规则可能不存在）
    }

    // 创建出站阻塞规则
    execSync(
      `netsh advfirewall firewall add rule name="${ruleName}" ` +
        `dir=out action=block program="${processPath}" enable=yes`,
      { stdio: 'pipe', timeout: 5000 },
    );
  } catch (err) {
    throw new Error(`Failed to create firewall rule: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 删除防火墙规则
 */
export function removeNetworkBlockRule(ruleId: string): void {
  const ruleName = `CodeYang_Sandbox_${ruleId}`;

  try {
    execSync(`netsh advfirewall firewall delete rule name="${ruleName}"`, {
      stdio: 'pipe',
      timeout: 5000,
    });
  } catch (err) {
    // 忽略删除失败（规则可能已不存在）
    console.warn(`Failed to remove firewall rule ${ruleName}:`, err);
  }
}

/**
 * 列出所有CodeYang创建的防火墙规则
 */
export function listCodeYangRules(): string[] {
  try {
    const output = execSync('netsh advfirewall firewall show rule name=all', {
      encoding: 'utf-8',
      timeout: 10000,
    });

    const rules: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/Rule Name:\s+(CodeYang_Sandbox_\w+)/);
      if (match) {
        rules.push(match[1]);
      }
    }

    return rules;
  } catch {
    return [];
  }
}

/**
 * 清理所有CodeYang创建的防火墙规则
 */
export function cleanupAllRules(): number {
  const rules = listCodeYangRules();
  let cleaned = 0;

  for (const ruleName of rules) {
    try {
      execSync(`netsh advfirewall firewall delete rule name="${ruleName}"`, {
        stdio: 'pipe',
        timeout: 5000,
      });
      cleaned++;
    } catch {
      // 忽略失败
    }
  }

  return cleaned;
}

/**
 * 测试防火墙规则是否生效
 */
export async function testFirewallBlock(ruleId: string): Promise<boolean> {
  // 创建一个临时规则阻塞ping
  const ruleName = `CodeYang_Test_${ruleId}`;

  try {
    execSync(
      `netsh advfirewall firewall add rule name="${ruleName}" ` +
        `dir=out action=block program="C:\\Windows\\System32\\PING.EXE" enable=yes`,
      { stdio: 'pipe', timeout: 5000 },
    );

    // 尝试ping（应该失败）
    try {
      execSync('ping -n 1 -w 1000 8.8.8.8', { stdio: 'pipe', timeout: 3000 });
      // 如果成功，说明防火墙没有生效
      return false;
    } catch {
      // ping失败，说明防火墙生效
      return true;
    }
  } finally {
    // 清理测试规则
    try {
      execSync(`netsh advfirewall firewall delete rule name="${ruleName}"`, {
        stdio: 'pipe',
      });
    } catch {
      // 忽略
    }
  }
}
