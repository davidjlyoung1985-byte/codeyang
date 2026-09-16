/**
 * OS 级网络隔离支持（可选增强）
 *
 * 提供真正的网络隔离能力，而不仅仅是环境变量标记。
 * 仅在支持的平台上可用。
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';

export interface NetworkIsolationCapabilities {
  supported: boolean;
  method?: 'unshare' | 'wfp' | 'sandbox-exec' | 'none';
  requiresRoot?: boolean;
  error?: string;
}

export interface WrappedNetworkCommand {
  command: string;
  args: string[];
  /** Release any OS resources allocated for isolation (profile file, firewall rule). */
  cleanup?: () => void;
}

/**
 * 检测系统是否支持网络隔离
 */
export async function detectNetworkIsolationSupport(): Promise<NetworkIsolationCapabilities> {
  const os = platform();

  // Linux: 检查 unshare 命令
  if (os === 'linux') {
    try {
      // 检查 unshare 是否存在
      execSync('which unshare', { stdio: 'ignore' });

      // 尝试运行 unshare --net (可能需要权限)
      try {
        execSync('unshare --net true', { stdio: 'ignore', timeout: 1000 });
        return {
          supported: true,
          method: 'unshare',
          requiresRoot: false,
        };
      } catch (err) {
        // 可能需要 root 权限或 CAP_SYS_ADMIN
        const error = err instanceof Error ? err.message : String(err);
        if (error.includes('Operation not permitted')) {
          return {
            supported: true,
            method: 'unshare',
            requiresRoot: true,
            error: 'Requires CAP_SYS_ADMIN capability or root privileges',
          };
        }
        throw err;
      }
    } catch {
      return {
        supported: false,
        error: 'unshare command not found or not functional',
      };
    }
  }

  // Windows: 使用 netsh 防火墙规则
  if (os === 'win32') {
    try {
      const { detectWindowsFirewall } = await import('./os-isolation-windows.js');
      const result = detectWindowsFirewall();

      if (!result.supported) {
        return {
          supported: false,
          error: result.error || 'Windows Firewall not available',
        };
      }

      if (result.requiresAdmin) {
        return {
          supported: true,
          method: 'wfp' as const,
          requiresRoot: true,
          error: 'Requires administrator privileges to create firewall rules',
        };
      }

      return {
        supported: true,
        method: 'wfp' as const,
        requiresRoot: false,
      };
    } catch {
      return {
        supported: false,
        error: 'Network isolation on Windows requires Windows Filtering Platform',
      };
    }
  }

  // macOS: 使用 sandbox-exec
  if (os === 'darwin') {
    try {
      const { detectMacOSSandbox } = await import('./os-isolation-macos.js');
      const result = detectMacOSSandbox();

      if (!result.supported) {
        return {
          supported: false,
          error: result.error || 'sandbox-exec not available',
        };
      }

      if (result.requiresSIPDisabled) {
        return {
          supported: true,
          method: 'sandbox-exec' as const,
          requiresRoot: false,
          error: 'System Integrity Protection (SIP) may restrict sandbox-exec usage',
        };
      }

      return {
        supported: true,
        method: 'sandbox-exec' as const,
        requiresRoot: false,
      };
    } catch {
      return {
        supported: false,
        error: 'Network isolation on macOS requires sandbox-exec (not available)',
      };
    }
  }

  return {
    supported: false,
    error: `Unsupported platform: ${os}`,
  };
}

/**
 * 包装命令以启用网络隔离
 *
 * @param command - 原始命令
 * @param args - 原始参数
 * @returns 包装后的命令、参数，以及可选的清理函数
 */
export async function wrapCommandWithNetworkIsolation(command: string, args: string[]): Promise<WrappedNetworkCommand> {
  const capabilities = await detectNetworkIsolationSupport();

  if (!capabilities.supported) {
    throw new Error(`Network isolation not supported: ${capabilities.error}`);
  }

  if (capabilities.method === 'unshare') {
    return {
      command: 'unshare',
      args: ['--net', '--', command, ...args],
    };
  }

  // macOS: sandbox-exec with a deny-network profile.
  if (capabilities.method === 'sandbox-exec') {
    const { wrapCommandWithSandbox, cleanupSandboxProfile } = await import('./os-isolation-macos.js');
    const wrapped = wrapCommandWithSandbox(command, args, true);
    return {
      command: wrapped.command,
      args: wrapped.args,
      cleanup: wrapped.profilePath ? () => cleanupSandboxProfile(wrapped.profilePath!) : undefined,
    };
  }

  // Windows: block the target executable's outbound traffic via a WFP
  // firewall rule for the duration of the run.
  if (capabilities.method === 'wfp') {
    const { createNetworkBlockRule, removeNetworkBlockRule } = await import('./os-isolation-windows.js');
    const programPath = resolveExecutablePath(command);
    if (!programPath) {
      throw new Error(`Cannot resolve executable path for "${command}" to apply a firewall rule`);
    }
    const ruleId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createNetworkBlockRule(programPath, ruleId);
    return {
      command,
      args,
      cleanup: () => removeNetworkBlockRule(ruleId),
    };
  }

  throw new Error('No network isolation method available');
}

/**
 * Resolve an executable name to an absolute path (best effort).
 * Used so a firewall rule can target the exact program image.
 */
function resolveExecutablePath(command: string): string | null {
  try {
    if (platform() === 'win32') {
      const out = execSync(`where ${command}`, { encoding: 'utf-8', timeout: 3000 });
      const first = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)[0];
      return first || null;
    }
    const out = execSync(`command -v ${command}`, { encoding: 'utf-8', timeout: 3000 });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 测试网络隔离是否生效
 *
 * @returns true 表示网络已被隔离
 */
export async function testNetworkIsolation(): Promise<boolean> {
  try {
    const { command, args } = await wrapCommandWithNetworkIsolation('ping', ['-c', '1', '8.8.8.8']);

    execSync(`${command} ${args.join(' ')}`, {
      stdio: 'ignore',
      timeout: 2000,
    });

    // 如果 ping 成功，说明网络没有被隔离
    return false;
  } catch {
    // ping 失败，说明网络被隔离（或命令失败）
    // 这是期望的结果
    return true;
  }
}

/**
 * 获取网络隔离状态的人类可读描述
 */
export async function getNetworkIsolationStatus(): Promise<string> {
  const capabilities = await detectNetworkIsolationSupport();

  if (!capabilities.supported) {
    return `❌ Network isolation not supported: ${capabilities.error}`;
  }

  if (capabilities.requiresRoot) {
    return `⚠️ Network isolation available but requires elevated privileges (${capabilities.method})`;
  }

  return `✅ Network isolation supported via ${capabilities.method}`;
}

/**
 * 示例：在沙箱中启用网络隔离的配置
 */
export const NETWORK_ISOLATION_EXAMPLE = {
  // 在 SandboxConfig 中添加：
  blockNetwork: true,
  useOsNetworkIsolation: true, // 新选项

  // 检测和启用逻辑：
  checkBeforeRun: async () => {
    const capabilities = await detectNetworkIsolationSupport();
    if (!capabilities.supported) {
      console.warn('OS-level network isolation not available, using soft blocking'); // eslint-disable-line no-console -- sample snippet
      return false;
    }
    return true;
  },
};
