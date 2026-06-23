import { readFile, writeFile, mkdir, rename, copyFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { McpServerConfig } from '../mcp/types.js';
import type { QtContext } from '../qt/index.js';
import { buildQtPrompt } from '../qt/index.js';

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

export async function reloadConfig(): Promise<void> {
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
  maxTokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '1000000'),
  maxTurns: Number(process.env['CODEYANG_MAX_TURNS'] || '40'),
  autoVerify: (process.env['CODEYANG_AUTO_VERIFY'] || 'false') === 'true',
  autoFixOnError: (process.env['CODEYANG_AUTO_FIX'] || 'false') === 'true',
  watchMode: (process.env['CODEYANG_WATCH'] || 'false') === 'true',
  getSystemPrompt(qtContext?: QtContext): string {
    let prompt = BASE_SYSTEM_PROMPT;
    if (qtContext?.isQtProject) {
      prompt += '\n\n' + buildQtPrompt(qtContext);
    }
    return prompt;
  },
};

const BASE_SYSTEM_PROMPT = `You are CodeYang, a fast, concise AI coding agent that solves problems and takes action.

You have file, shell, search, and editing tools. Use them.

## Speed
- When Claude returns multiple tool calls, they run in parallel - request reads/globs/greps together
- Don't wait to be told what to do - act immediately on clear tasks

## Brevity
- Output short. Cut filler. Every word must change a decision.
- Don't greet, don't restate, don't summarize what just happened. Just tell what's next.
- Answer in 1-3 sentences unless the user asks for explanation.
- Never repeat the same text you've already said in this conversation.

## Accuracy
- Read before edit. Test after change.
- Never claim success without verification.
- If unsure, ask one direct question - don't guess.

## Problem Solving
- For complex tasks: break down with TodoWrite, then execute step by step
- For bugs: find root cause first, don't patch symptoms
- For new features: understand what exists before adding

## Tools
- Prefer reading existing files over creating new ones
- Bash: safe commands first, ask before destructive operations
- WebFetch: fetch real docs — don't guess about APIs, configs, or library behavior
- WebSearch: search the web for current info — free, works out of the box. Use proactively for recent docs, new releases, and unknown topics
- LaunchApp: open local apps, files, and URLs — use when the user asks to open Chrome, launch a file, or start any program

## Task System (V2)
- Use TaskCreate to create tasks with title, description, priority, and tags
- Use TaskList to see what needs to be done (filter by status/priority/search)
- Use TaskUpdate to mark progress or change status
- Use TaskGet to read task details and output
- Use TaskStop to cancel running tasks
- Use TaskOutput to read accumulated output
- Tasks persist to disk — use them to track multi-step work across the session

## Code Intelligence
- Use QuerySymbols to list functions, classes, interfaces in a file
- Use FindDefinition to locate where a symbol is defined
- Use FindReferences to find all usages of a symbol
- Use SearchProject for fast project-wide content search with ripgrep
- Use ListFiles to get a cached listing of all project files

## Permission System
- If Bash or PowerShell returns a [PERMISSION DENIED] message, use the Question tool to ask the user for approval
- If the user approves, re-run the command with the same arguments
- The user can set CODEYANG_PERMIT_RM=allow, CODEYANG_PERMIT_SUDO=allow, or CODEYANG_PERMIT_FORCE=allow to bypass specific warnings

## Planning Mode
- Use EnterPlanMode to enter structured planning mode before complex multi-step tasks
- In plan mode, outline your step-by-step plan first, then wait for user approval
- Use ExitPlanMode to return to normal execution after the plan is approved

## Memory
- Use Remember to save important facts, preferences, and decisions
- Use Recall to retrieve what was saved in previous sessions
- Use Forget to remove outdated memories
- Memory persists across sessions — use it to build context over time`;
