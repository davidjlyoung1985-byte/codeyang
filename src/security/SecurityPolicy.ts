/**
 * 统一的安全策略模块
 *
 * 目标：收敛 BashTool 和 Sandbox 中重复的安全检查逻辑
 */

import { minimatch } from 'minimatch';
import { normalize, isAbsolute } from 'node:path';

// ===================== 配置 =====================

export interface SecurityConfig {
  /** 命令黑名单（用户可配置，来自环境变量） */
  deniedCommands: string[];
  /** 路径黑名单模式（glob） */
  blockedPathPatterns: string[];
  /** 允许的路径列表（空数组 = 允许所有） */
  allowedPaths: string[];
  /** 环境变量白名单 */
  allowedEnvVars: string[];
  /** 是否阻止网络访问 */
  blockNetwork: boolean;
}

const DEFAULT_BLOCKED_PATHS = [
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/passwd',
  '/dev/sd*',
  '/sys/*',
  '/proc/sys/*',
  'C:\\Windows\\System32\\config\\*',
  'C:\\Windows\\System32\\drivers\\*',
];

const DEFAULT_ALLOWED_ENV_VARS = ['PATH', 'HOME', 'USER', 'LANG', 'NODE_PATH', 'TEMP', 'TMP'];

// ===================== 命令安全检查 =====================

/**
 * 检查命令是否在黑名单中
 *
 * 包含反混淆和注入检测逻辑
 */
export function isCommandDenied(command: string, denyList: string[]): boolean {
  // 规范化命令：移除引号、反斜杠，转小写
  const normalized = command
    .replace(/['"\\]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  // 按 shell 元字符分割
  const tokens = normalized.split(/[\s;|&`$()<>{}[\]]+/).filter(Boolean);

  // 检查每个 token
  for (const token of tokens) {
    for (const denied of denyList) {
      const deniedLower = denied.toLowerCase();

      // 精确匹配或前缀匹配
      if (token === deniedLower || token.startsWith(deniedLower)) {
        return true;
      }

      // 子串匹配（防止混淆如 "r""m" → "rm"）
      if (token.includes(deniedLower)) {
        return true;
      }
    }
  }

  // 检查可疑的注入模式
  const suspiciousPatterns = [
    /curl.*\|\s*(sh|bash)/i, // curl | sh
    /wget.*\|\s*(sh|bash)/i, // wget | sh
    />\s*\/dev\/sd/i, // 写入裸设备
    /mkfs/i, // 格式化文件系统
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(command)) {
      return true;
    }
  }

  return false;
}

// ===================== 路径安全检查 =====================

/**
 * 检查路径是否被允许访问
 *
 * 规则：
 * 1. 如果 allowedPaths 不为空，路径必须在白名单中
 * 2. 路径不能匹配任何 blockedPathPatterns
 */
export function isPathAllowed(path: string, allowedPaths: string[], blockedPatterns: string[]): boolean {
  // Normalize and convert to forward slashes for cross-platform glob matching
  const normalized = normalize(path).replace(/\\/g, '/');

  // 白名单检查（如果配置了白名单）
  if (allowedPaths.length > 0) {
    const inWhitelist = allowedPaths.some((allowed) => {
      const normalizedAllowed = normalize(allowed).replace(/\\/g, '/');
      return normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + '/');
    });

    if (!inWhitelist) {
      return false;
    }
  }

  // 黑名单检查
  for (const pattern of blockedPatterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    if (minimatch(normalized, normalizedPattern, { nocase: true })) {
      return false;
    }
  }

  return true;
}

/**
 * 检查命令及其参数中的路径是否安全
 */
export function validateCommandPaths(
  command: string,
  args: string[],
  config: Pick<SecurityConfig, 'allowedPaths' | 'blockedPathPatterns'>,
): { valid: boolean; blockedPath?: string } {
  // 检查命令本身（如果是绝对路径）
  if (isAbsolute(command)) {
    if (!isPathAllowed(command, config.allowedPaths, config.blockedPathPatterns)) {
      return { valid: false, blockedPath: command };
    }
  }

  // 检查参数中的路径
  for (const arg of args) {
    if (isAbsolute(arg)) {
      if (!isPathAllowed(arg, config.allowedPaths, config.blockedPathPatterns)) {
        return { valid: false, blockedPath: arg };
      }
    }
  }

  return { valid: true };
}

// ===================== 环境变量过滤 =====================

/**
 * 过滤环境变量，只保留白名单中的
 */
export function filterEnvVars(
  env: NodeJS.ProcessEnv,
  allowList: string[],
  additionalVars?: Record<string, string>,
): Record<string, string> {
  const filtered: Record<string, string> = {};

  // 保留白名单中的环境变量
  for (const key of allowList) {
    if (env[key] !== undefined) {
      filtered[key] = env[key]!;
    }
  }

  // 添加额外的自定义变量
  if (additionalVars) {
    Object.assign(filtered, additionalVars);
  }

  return filtered;
}

// ===================== 日志脱敏 =====================

/**
 * 脱敏日志中的敏感信息
 *
 * 防止密码、token、API key 泄露到日志中
 */
export function sanitizeForLogging(text: string): string {
  let sanitized = text;

  // 脱敏密码参数：-p password, --password=xxx, -u user:pass
  sanitized = sanitized.replace(/(-p\s+|--password[=\s]+)\S+/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/(-u\s+\S+:)\S+/gi, '$1[REDACTED]');

  // 脱敏环境变量赋值：VAR=secret
  sanitized = sanitized.replace(/\b(PASSWORD|TOKEN|SECRET|KEY|AUTH)=[^\s;|&]+/gi, '$1=[REDACTED]');

  // 脱敏 API keys 和 tokens：sk-..., Bearer xxx, token=xxx
  sanitized = sanitized.replace(/\b(sk-[a-zA-Z0-9]{20,})/g, '[REDACTED_API_KEY]');
  sanitized = sanitized.replace(/\b(Bearer\s+)[^\s;|&]+/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/\b(token|apikey|api_key)=[^\s;|&]+/gi, '$1=[REDACTED]');

  // 脱敏 Base64 编码的凭证（常见于 Authorization headers）
  sanitized = sanitized.replace(/\b([A-Za-z0-9+/]{40,}={0,2})\b/g, '[REDACTED_BASE64]');

  return sanitized;
}

// ===================== 综合安全检查 =====================

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  blockedItem?: string;
}

/**
 * 综合安全检查
 *
 * 在执行命令前调用，统一检查所有安全规则
 */
export function checkCommandSecurity(command: string, args: string[], config: SecurityConfig): SecurityCheckResult {
  // 1. 检查命令黑名单
  if (isCommandDenied(command, config.deniedCommands)) {
    return {
      allowed: false,
      reason: 'Command blocked by deny list',
      blockedItem: command,
    };
  }

  // 2. 检查路径安全
  const pathCheck = validateCommandPaths(command, args, config);
  if (!pathCheck.valid) {
    return {
      allowed: false,
      reason: 'Path blocked by security policy',
      blockedItem: pathCheck.blockedPath,
    };
  }

  return { allowed: true };
}

// ===================== 工具函数 =====================

/**
 * 从环境变量加载命令黑名单
 */
export function loadDenyListFromEnv(): string[] {
  return (process.env['CODEYANG_DENY_COMMANDS'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 创建默认的安全配置
 */
export function createDefaultSecurityConfig(overrides?: Partial<SecurityConfig>): SecurityConfig {
  return {
    deniedCommands: loadDenyListFromEnv(),
    blockedPathPatterns: DEFAULT_BLOCKED_PATHS,
    allowedPaths: [],
    allowedEnvVars: DEFAULT_ALLOWED_ENV_VARS,
    blockNetwork: false,
    ...overrides,
  };
}
