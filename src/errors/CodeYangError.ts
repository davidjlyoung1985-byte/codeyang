/**
 * CodeYangError — 统一错误处理系统
 *
 * 功能：
 * - 统一的错误类型定义
 * - 错误分类和编码
 * - 错误恢复策略
 * - 结构化错误信息
 */

export enum ErrorCode {
  // 工具执行错误 (1xxx)
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_INVALID_INPUT = 'TOOL_INVALID_INPUT',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',

  // LLM API 错误 (2xxx)
  LLM_API_ERROR = 'LLM_API_ERROR',
  LLM_RATE_LIMIT = 'LLM_RATE_LIMIT',
  LLM_INVALID_RESPONSE = 'LLM_INVALID_RESPONSE',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  LLM_AUTH_FAILED = 'LLM_AUTH_FAILED',

  // 文件系统错误 (3xxx)
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  FILE_PERMISSION_DENIED = 'FILE_PERMISSION_DENIED',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',

  // 网络错误 (4xxx)
  NETWORK_ERROR = 'NETWORK_ERROR',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION_REFUSED = 'NETWORK_CONNECTION_REFUSED',
  NETWORK_DNS_ERROR = 'NETWORK_DNS_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // 权限错误 (5xxx)
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  INSUFFICIENT_PRIVILEGES = 'INSUFFICIENT_PRIVILEGES',

  // 配置错误 (6xxx)
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

  // 验证错误 (7xxx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // 状态错误 (8xxx)
  INVALID_STATE = 'INVALID_STATE',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',

  // 资源错误 (9xxx)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // 系统错误 (10xxx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  DEPRECATED = 'DEPRECATED',

  // 未知错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorContext {
  /** 操作名称 */
  operation?: string;
  /** 工具名称 */
  tool?: string;
  /** 文件路径 */
  filePath?: string;
  /** 额外的上下文信息 */
  [key: string]: unknown;
}

export interface RecoveryStrategy {
  /** 是否可以重试 */
  canRetry: boolean;
  /** 建议的重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 是否可以降级 */
  canFallback: boolean;
  /** 降级建议 */
  fallbackSuggestion?: string;
}

export class CodeYangError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly context: ErrorContext;
  public readonly originalError?: Error;
  public readonly timestamp: number;
  public readonly recovery: RecoveryStrategy;
  /** 面向用户的友好错误说明（含修复建议），未提供时回退到 getUserMessage() */
  public readonly userMessage?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    options: {
      recoverable?: boolean;
      context?: ErrorContext;
      originalError?: Error;
      recovery?: Partial<RecoveryStrategy>;
      userMessage?: string;
    } = {},
  ) {
    super(message);

    this.name = 'CodeYangError';
    this.code = code;
    this.recoverable = options.recoverable ?? this.isRecoverableByDefault(code);
    this.context = options.context ?? {};
    this.originalError = options.originalError;
    this.userMessage = options.userMessage;
    this.timestamp = Date.now();

    // 设置恢复策略
    this.recovery = {
      canRetry: options.recovery?.canRetry ?? this.canRetryByDefault(code),
      maxRetries: options.recovery?.maxRetries ?? this.getDefaultMaxRetries(code),
      retryDelay: options.recovery?.retryDelay ?? this.getDefaultRetryDelay(code),
      canFallback: options.recovery?.canFallback ?? false,
      fallbackSuggestion: options.recovery?.fallbackSuggestion,
    };

    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CodeYangError);
    }

    // 如果有原始错误，附加其堆栈
    if (options.originalError && options.originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.originalError.stack}`;
    }
  }

  /**
   * 获取完整的错误信息
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
      timestamp: this.timestamp,
      recovery: this.recovery,
      userMessage: this.userMessage,
      stack: this.stack,
    };
  }

  /**
   * 获取用户友好的错误描述
   */
  getUserMessage(): string {
    // 显式提供的用户说明优先（通常包含修复建议/多行指引）
    if (this.userMessage) {
      return this.userMessage;
    }

    const messages: Record<ErrorCode, string> = {
      [ErrorCode.TOOL_EXECUTION_FAILED]: '工具执行失败',
      [ErrorCode.TOOL_NOT_FOUND]: '未找到指定的工具',
      [ErrorCode.TOOL_INVALID_INPUT]: '工具输入参数无效',
      [ErrorCode.TOOL_TIMEOUT]: '工具执行超时',
      [ErrorCode.LLM_API_ERROR]: 'LLM API 调用失败',
      [ErrorCode.LLM_RATE_LIMIT]: 'API 调用频率超限，请稍后重试',
      [ErrorCode.LLM_INVALID_RESPONSE]: 'LLM 返回了无效的响应',
      [ErrorCode.LLM_TIMEOUT]: 'LLM API 请求超时',
      [ErrorCode.LLM_AUTH_FAILED]: 'API 认证失败，请检查您的 API Key',
      [ErrorCode.FILE_NOT_FOUND]: '文件不存在',
      [ErrorCode.FILE_READ_ERROR]: '文件读取失败',
      [ErrorCode.FILE_WRITE_ERROR]: '文件写入失败',
      [ErrorCode.FILE_PERMISSION_DENIED]: '没有文件访问权限',
      [ErrorCode.DIRECTORY_NOT_FOUND]: '目录不存在',
      [ErrorCode.NETWORK_ERROR]: '网络连接失败',
      [ErrorCode.NETWORK_TIMEOUT]: '网络请求超时',
      [ErrorCode.NETWORK_CONNECTION_REFUSED]: '连接被拒绝',
      [ErrorCode.NETWORK_DNS_ERROR]: 'DNS 解析失败',
      [ErrorCode.TIMEOUT_ERROR]: '操作超时',
      [ErrorCode.PERMISSION_DENIED]: '操作权限不足',
      [ErrorCode.AUTH_REQUIRED]: '需要身份验证',
      [ErrorCode.AUTHENTICATION_ERROR]: '认证失败，请检查凭据',
      [ErrorCode.INSUFFICIENT_PRIVILEGES]: '权限不足',
      [ErrorCode.CONFIG_INVALID]: '配置文件无效',
      [ErrorCode.CONFIG_MISSING]: '缺少必要的配置',
      [ErrorCode.CONFIG_PARSE_ERROR]: '配置文件解析失败',
      [ErrorCode.CONFIGURATION_ERROR]: '配置错误',
      [ErrorCode.VALIDATION_ERROR]: '输入验证失败',
      [ErrorCode.INVALID_ARGUMENT]: '参数无效',
      [ErrorCode.MISSING_REQUIRED_FIELD]: '缺少必填字段',
      [ErrorCode.INVALID_STATE]: '当前状态不允许此操作',
      [ErrorCode.OPERATION_NOT_ALLOWED]: '操作不被允许',
      [ErrorCode.RESOURCE_LOCKED]: '资源被锁定',
      [ErrorCode.CIRCUIT_BREAKER_OPEN]: '服务暂时不可用（熔断器已开启），请稍后重试',
      [ErrorCode.RESOURCE_NOT_FOUND]: '资源不存在',
      [ErrorCode.RESOURCE_EXHAUSTED]: '资源已耗尽',
      [ErrorCode.QUOTA_EXCEEDED]: '配额已超限',
      [ErrorCode.INTERNAL_ERROR]: '内部错误',
      [ErrorCode.NOT_IMPLEMENTED]: '功能尚未实现',
      [ErrorCode.DEPRECATED]: '此功能已弃用',
      [ErrorCode.UNKNOWN_ERROR]: '未知错误',
    };

    return messages[this.code] || this.message;
  }

  /**
   * 判断错误是否默认可恢复
   */
  private isRecoverableByDefault(code: ErrorCode): boolean {
    const recoverableCodes = [
      ErrorCode.LLM_RATE_LIMIT,
      ErrorCode.LLM_TIMEOUT,
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.NETWORK_CONNECTION_REFUSED,
      ErrorCode.TOOL_TIMEOUT,
      ErrorCode.TIMEOUT_ERROR,
      ErrorCode.CIRCUIT_BREAKER_OPEN,
    ];

    return recoverableCodes.includes(code);
  }

  /**
   * 判断错误是否默认可重试
   */
  private canRetryByDefault(code: ErrorCode): boolean {
    const retryableCodes = [
      ErrorCode.LLM_RATE_LIMIT,
      ErrorCode.LLM_TIMEOUT,
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TOOL_TIMEOUT,
      ErrorCode.TIMEOUT_ERROR,
      ErrorCode.CIRCUIT_BREAKER_OPEN,
    ];

    return retryableCodes.includes(code);
  }

  /**
   * 获取默认的最大重试次数
   */
  private getDefaultMaxRetries(code: ErrorCode): number {
    switch (code) {
      case ErrorCode.LLM_RATE_LIMIT:
        return 3;
      case ErrorCode.NETWORK_TIMEOUT:
      case ErrorCode.LLM_TIMEOUT:
        return 2;
      default:
        return 1;
    }
  }

  /**
   * 获取默认的重试延迟
   */
  private getDefaultRetryDelay(code: ErrorCode): number {
    switch (code) {
      case ErrorCode.LLM_RATE_LIMIT:
        return 5000; // 5秒
      case ErrorCode.NETWORK_TIMEOUT:
        return 2000; // 2秒
      default:
        return 1000; // 1秒
    }
  }
}

/**
 * 工具执行错误
 */
export class ToolExecutionError extends CodeYangError {
  constructor(toolName: string, message: string, originalError?: Error) {
    super(message, ErrorCode.TOOL_EXECUTION_FAILED, {
      context: { tool: toolName },
      originalError,
      recoverable: false,
    });
    this.name = 'ToolExecutionError';
  }
}

/**
 * LLM API 错误
 */
export class LLMApiError extends CodeYangError {
  constructor(message: string, code: ErrorCode = ErrorCode.LLM_API_ERROR, originalError?: Error) {
    super(message, code, {
      originalError,
      recoverable: code === ErrorCode.LLM_RATE_LIMIT || code === ErrorCode.LLM_TIMEOUT,
    });
    this.name = 'LLMApiError';
  }
}

/**
 * 文件系统错误
 */
export class FileSystemError extends CodeYangError {
  constructor(filePath: string, message: string, code: ErrorCode, originalError?: Error) {
    super(message, code, {
      context: { filePath },
      originalError,
      recoverable: false,
    });
    this.name = 'FileSystemError';
  }
}

/**
 * 网络错误
 */
export class NetworkError extends CodeYangError {
  constructor(message: string, code: ErrorCode = ErrorCode.NETWORK_ERROR, originalError?: Error) {
    super(message, code, {
      originalError,
      recoverable: true,
    });
    this.name = 'NetworkError';
  }
}

/**
 * 从普通错误创建 CodeYangError
 */
export function wrapError(error: Error, context?: ErrorContext): CodeYangError {
  if (error instanceof CodeYangError) {
    return error;
  }

  // 尝试推断错误类型
  let code = ErrorCode.UNKNOWN_ERROR;

  if (error.message.includes('ENOENT') || error.message.includes('not found')) {
    code = ErrorCode.FILE_NOT_FOUND;
  } else if (error.message.includes('EACCES') || error.message.includes('permission')) {
    code = ErrorCode.PERMISSION_DENIED;
  } else if (error.message.includes('timeout')) {
    code = ErrorCode.NETWORK_TIMEOUT;
  } else if (error.message.includes('rate limit') || error.message.includes('429')) {
    code = ErrorCode.LLM_RATE_LIMIT;
  } else if (error.message.includes('ECONNREFUSED')) {
    code = ErrorCode.NETWORK_CONNECTION_REFUSED;
  }

  return new CodeYangError(error.message, code, {
    context,
    originalError: error,
  });
}

/**
 * 判断错误是否可重试
 */
export function isRetryable(error: Error): boolean {
  if (error instanceof CodeYangError) {
    return error.recovery.canRetry;
  }

  // 对于非 CodeYangError，检查常见的可重试错误
  const retryablePatterns = ['timeout', 'rate limit', '429', '503', 'ECONNRESET', 'ETIMEDOUT'];

  return retryablePatterns.some((pattern) => error.message.toLowerCase().includes(pattern.toLowerCase()));
}

/**
 * 获取错误的重试延迟
 */
export function getRetryDelay(error: Error, attempt: number): number {
  if (error instanceof CodeYangError && error.recovery.retryDelay) {
    // 指数退避
    return error.recovery.retryDelay * Math.pow(2, attempt - 1);
  }

  // 默认：1秒、2秒、4秒...
  return 1000 * Math.pow(2, attempt - 1);
}
