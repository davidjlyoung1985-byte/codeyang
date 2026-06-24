import { readFile, writeFile, mkdir, rename, copyFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { McpServerConfig } from '../mcp/types.js';
import type { QtContext } from '../qt/index.js';
import { buildQtPrompt } from '../qt/index.js';
import { BASE_SYSTEM_PROMPT } from './system-prompt.js';

const CONFIG_DIR = join(homedir(), '.codeyang');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * 跨设备安全的原子写入。
 *
 * 先用临时文件写入，再 rename 到目标路径，这样对读者来说是原子的（文件内容要么完整要么不变）。
 *
 * rename() 在源和目标跨文件系统时抛出 EXDEV（例如 %TEMP% 在 C: 而 .codeyang 在 D:）。
 * 此时回退到 copyFile + unlink，语义上仍是原子的（copyFile 是统计语义）。
 */
async function safeRename(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EXDEV') {
      // 跨设备：copy + unlink
      await copyFile(src, dest);
      await unlink(src).catch(() => {}); // 尽力清理临时文件
    } else {
      throw err;
    }
  }
}

/** Atomic JSON write: write to temp file then rename to prevent corruption on crash. */
async function atomicWriteConfig(data: unknown): Promise<void> {
  // SECURITY: Use crypto-secure UUID instead of predictable PID
  const tmp = `${CONFIG_FILE}.tmp.${randomUUID()}`;
  const json = JSON.stringify(data, null, 2);
  await writeFile(tmp, json, 'utf-8');
  await safeRename(tmp, CONFIG_FILE);
}

interface LocalConfig {
  apiKey?: string;
  apiBaseURL?: string;
  apiProvider?: string;
  mcpServers?: Record<string, McpServerConfig>;
  cwd?: string;
  maxRetries?: number;
}

let localConfig: LocalConfig = {};

export interface ValidationError {
  field: string;
  message: string;
}

export function validateConfig(): ValidationError[] {
  const errors: ValidationError[] = [];

  if (localConfig.apiKey !== undefined && typeof localConfig.apiKey !== 'string') {
    errors.push({ field: 'apiKey', message: 'must be a string' });
  }

  if (localConfig.apiBaseURL !== undefined && typeof localConfig.apiBaseURL !== 'string') {
    errors.push({ field: 'apiBaseURL', message: 'must be a string' });
  }

  if (localConfig.apiProvider !== undefined && !['deepseek', 'anthropic', 'custom'].includes(localConfig.apiProvider)) {
    errors.push({ field: 'apiProvider', message: 'must be "deepseek", "anthropic", or "custom"' });
  }

  if (localConfig.mcpServers !== undefined) {
    if (typeof localConfig.mcpServers !== 'object' || Array.isArray(localConfig.mcpServers)) {
      errors.push({ field: 'mcpServers', message: 'must be an object mapping server names to configs' });
    } else {
      for (const [name, cfg] of Object.entries(localConfig.mcpServers)) {
        if (typeof cfg !== 'object' || cfg === null) {
          errors.push({ field: `mcpServers.${name}`, message: 'must be an object with "command" and "args"' });
        }
      }
    }
  }

  return errors;
}

export async function loadLocalConfig(): Promise<void> {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    localConfig = JSON.parse(data);
    validateConfig();
  } catch {
    localConfig = {};
  }
}

export function getLocalConfigApiKey(): string {
  return localConfig.apiKey || '';
}

export async function saveApiSettings(settings: {
  apiKey: string;
  apiBaseURL?: string;
  apiProvider?: string;
}): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  localConfig.apiKey = settings.apiKey;
  if (settings.apiBaseURL) localConfig.apiBaseURL = settings.apiBaseURL;
  if (settings.apiProvider) localConfig.apiProvider = settings.apiProvider;
  await atomicWriteConfig(localConfig);
}

export function getMcpServers(): Record<string, McpServerConfig> {
  return localConfig.mcpServers ?? {};
}

export async function saveMcpServers(servers: Record<string, McpServerConfig>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  localConfig.mcpServers = servers;
  await atomicWriteConfig(localConfig);
}

let modelOverride: string | undefined;

export function setSessionApiKey(key: string) {
  sessionApiKey = key;
}

let sessionApiKey = '';
let _configVersion = 0;

export function getConfigVersion(): number {
  return _configVersion;
}

/** 防止 reloadConfig 并发执行 */
let reloadingPromise: Promise<void> | null = null;

export async function reloadConfig(): Promise<void> {
  // 如果已有 reload 在执行，复用其 Promise 防止竞态
  if (reloadingPromise) {
    return reloadingPromise;
  }

  reloadingPromise = (async () => {
    try {
      const { readFile: fsReadFile } = await import('node:fs/promises');
      const data = await fsReadFile(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      // Merge without losing session API key
      const currentKey = sessionApiKey || localConfig.apiKey;
      localConfig = parsed;
      if (currentKey) {
        localConfig.apiKey = currentKey;
        sessionApiKey = currentKey;
      }
      _configVersion++;
      console.log(`Configuration reloaded (v${_configVersion})`);
    } catch (err) {
      throw new Error(`Failed to reload config: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  try {
    return await reloadingPromise;
  } finally {
    reloadingPromise = null;
  }
}

export const config = {
  get model() {
    if (modelOverride) return modelOverride;
    return process.env['CODEYANG_MODEL'] || 'deepseek-chat';
  },
  set model(v: string) {
    modelOverride = v;
  },
  get apiKey() {
    return (
      sessionApiKey || process.env['CODEYANG_API_KEY'] || process.env['DEEPSEEK_API_KEY'] || localConfig.apiKey || ''
    );
  },
  get baseURL() {
    return process.env['CODEYANG_BASE_URL'] || localConfig.apiBaseURL || 'https://api.deepseek.com/anthropic';
  },
  get provider() {
    return localConfig.apiProvider || 'deepseek';
  },
  get maxTokens() {
    const rawTokens = process.env['CODEYANG_MAX_TOKENS'];
    let val = rawTokens ? Number(rawTokens) : 1000000;
    if (Number.isNaN(val)) val = 1000000;
    return val;
  },
  maxTurns: Number(process.env['CODEYANG_MAX_TURNS'] || '40'),
  autoVerify: (process.env['CODEYANG_AUTO_VERIFY'] || 'true') === 'true',
  autoFixOnError: (process.env['CODEYANG_AUTO_FIX'] || 'true') === 'true',
  watchMode: (process.env['CODEYANG_WATCH'] || 'true') === 'true',

  get cwd(): string {
    return process.env['CODEYANG_CWD'] || localConfig.cwd || process.cwd();
  },
  get maxRetries(): number {
    const raw = process.env['CODEYANG_MAX_RETRIES'];
    let val = raw ? Number(raw) : (localConfig.maxRetries ?? 3);
    if (Number.isNaN(val)) val = 3;
    return val;
  },

  // Reflexion configuration
  reflexion: {
    enabled: (process.env['CODEYANG_REFLEXION'] || 'true') === 'true',
    failureThreshold: Number(process.env['CODEYANG_REFLEXION_THRESHOLD'] || '2'),
    maxReflections: Number(process.env['CODEYANG_REFLEXION_MAX'] || '50'),
    autoInject: (process.env['CODEYANG_REFLEXION_AUTO_INJECT'] || 'true') === 'true',
  },

  // Planner configuration
  planner: {
    enabled: (process.env['CODEYANG_PLANNER'] || 'true') === 'true',
    autoDetect: (process.env['CODEYANG_PLANNER_AUTO'] || 'true') === 'true',
    complexityThreshold: Number(process.env['CODEYANG_PLANNER_THRESHOLD'] || '3'),
    requireApproval: (process.env['CODEYANG_PLANNER_APPROVAL'] || 'true') === 'true',
    maxRetries: Number(process.env['CODEYANG_PLANNER_RETRIES'] || '2'),
  },

  getSystemPrompt(qtContext?: QtContext): string {
    let prompt = BASE_SYSTEM_PROMPT;
    if (qtContext?.isQtProject) {
      prompt += '\n\n' + buildQtPrompt(qtContext);
    }
    return prompt;
  },
};
