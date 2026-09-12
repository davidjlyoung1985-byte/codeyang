/**
 * macOS网络隔离实现
 * 使用 sandbox-exec (macOS原生沙箱)
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface MacOSIsolationResult {
  supported: boolean;
  requiresSIPDisabled: boolean;
  error?: string;
}

/**
 * 检测macOS sandbox-exec是否可用
 */
export function detectMacOSSandbox(): MacOSIsolationResult {
  if (platform() !== 'darwin') {
    return {
      supported: false,
      requiresSIPDisabled: false,
      error: 'Not macOS platform',
    };
  }

  try {
    // 检查 sandbox-exec 命令是否存在
    execSync('which sandbox-exec', { stdio: 'pipe', timeout: 2000 });

    // 测试 sandbox-exec 是否能运行简单命令
    try {
      execSync('sandbox-exec -p "(version 1)" echo test', {
        stdio: 'pipe',
        timeout: 2000,
      });

      return {
        supported: true,
        requiresSIPDisabled: false,
      };
    } catch (err) {
      // 可能是SIP限制
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('Operation not permitted') || errorMsg.includes('denied')) {
        return {
          supported: true,
          requiresSIPDisabled: true,
          error: 'System Integrity Protection (SIP) may be blocking sandbox-exec',
        };
      }
      throw err;
    }
  } catch {
    return {
      supported: false,
      requiresSIPDisabled: false,
      error: 'sandbox-exec not available',
    };
  }
}

/**
 * 生成sandbox-exec配置文件内容
 */
export function generateSandboxProfile(allowNetwork: boolean = false): string {
  const profile = `
(version 1)
(debug deny)

; 允许基本操作
(allow default)

; 允许进程执行
(allow process-exec*)
(allow process-fork)

; 允许文件系统访问
(allow file-read*)
(allow file-write*)

; 网络访问控制
${allowNetwork ? '(allow network*)' : '(deny network*)'}

; 允许系统调用
(allow system-socket)
(allow mach-lookup)
(allow ipc-posix-shm*)
`.trim();

  return profile;
}

/**
 * 使用sandbox-exec包装命令以隔离网络
 */
export function wrapCommandWithSandbox(
  command: string,
  args: string[],
  blockNetwork: boolean = true,
): { command: string; args: string[]; profilePath?: string } {
  if (!blockNetwork) {
    return { command, args };
  }

  // 生成临时配置文件
  const profilePath = join(tmpdir(), `codeyang-sandbox-${Date.now()}.sb`);
  const profile = generateSandboxProfile(false);
  writeFileSync(profilePath, profile);

  return {
    command: 'sandbox-exec',
    args: ['-f', profilePath, command, ...args],
    profilePath,
  };
}

/**
 * 清理临时sandbox配置文件
 */
export function cleanupSandboxProfile(profilePath: string): void {
  try {
    unlinkSync(profilePath);
  } catch {
    // 忽略错误
  }
}

/**
 * 测试sandbox-exec网络隔离是否生效
 */
export async function testSandboxNetworkBlock(): Promise<boolean> {
  const profile = generateSandboxProfile(false);
  const profilePath = join(tmpdir(), `codeyang-test-${Date.now()}.sb`);

  try {
    writeFileSync(profilePath, profile);

    // 尝试在沙箱中ping（应该失败）
    try {
      execSync(`sandbox-exec -f ${profilePath} ping -c 1 -W 1 8.8.8.8`, {
        stdio: 'pipe',
        timeout: 3000,
      });
      // 如果成功，说明网络没有被阻塞
      return false;
    } catch {
      // ping失败，说明网络被阻塞
      return true;
    }
  } finally {
    cleanupSandboxProfile(profilePath);
  }
}

/**
 * 检查SIP状态
 */
export function checkSIPStatus(): { enabled: boolean; canBypass: boolean } {
  try {
    const output = execSync('csrutil status', {
      encoding: 'utf-8',
      timeout: 2000,
    });

    const enabled = !output.includes('disabled');

    // 即使SIP启用，某些场景下仍可能使用sandbox-exec
    const canBypass = !enabled || output.includes('Filesystem Protections: disabled');

    return { enabled, canBypass };
  } catch {
    // 无法检测，假设启用
    return { enabled: true, canBypass: false };
  }
}

/**
 * 获取macOS沙箱状态的人类可读描述
 */
export function getMacOSSandboxStatus(): string {
  const result = detectMacOSSandbox();

  if (!result.supported) {
    return `❌ macOS sandbox not supported: ${result.error}`;
  }

  if (result.requiresSIPDisabled) {
    const sip = checkSIPStatus();
    if (sip.enabled) {
      return `⚠️ sandbox-exec available but SIP may restrict usage. Consider disabling SIP or using alternative methods.`;
    }
  }

  return `✅ macOS sandbox-exec supported`;
}
