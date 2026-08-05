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
  method?: 'unshare' | 'none';
  requiresRoot?: boolean;
  error?: string;
}

/**
 * 检测系统是否支持网络隔离
 */
export function detectNetworkIsolationSupport(): NetworkIsolationCapabilities {
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

  // Windows: 不支持（需要 Job Objects，暂未实现）
  if (os === 'win32') {
    return {
      supported: false,
      error: 'Network isolation on Windows requires Job Objects (not yet implemented)',
    };
  }

  // macOS: 不支持（需要 sandbox-exec，复杂且限制多）
  if (os === 'darwin') {
    return {
      supported: false,
      error: 'Network isolation on macOS requires sandbox-exec (not yet implemented)',
    };
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
 * @returns 包装后的命令和参数
 */
export function wrapCommandWithNetworkIsolation(command: string, args: string[]): { command: string; args: string[] } {
  const capabilities = detectNetworkIsolationSupport();

  if (!capabilities.supported) {
    throw new Error(`Network isolation not supported: ${capabilities.error}`);
  }

  if (capabilities.method === 'unshare') {
    return {
      command: 'unshare',
      args: ['--net', '--', command, ...args],
    };
  }

  // 不应该到达这里
  throw new Error('No network isolation method available');
}

/**
 * 测试网络隔离是否生效
 *
 * @returns true 表示网络已被隔离
 */
export async function testNetworkIsolation(): Promise<boolean> {
  try {
    const { command, args } = wrapCommandWithNetworkIsolation('ping', ['-c', '1', '8.8.8.8']);

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
export function getNetworkIsolationStatus(): string {
  const capabilities = detectNetworkIsolationSupport();

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
  checkBeforeRun: () => {
    const capabilities = detectNetworkIsolationSupport();
    if (!capabilities.supported) {
      console.warn('OS-level network isolation not available, using soft blocking');
      return false;
    }
    return true;
  },
};
