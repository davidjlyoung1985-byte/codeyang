import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { McpServerConfig } from '../mcp/types.js';
import type { QtContext } from '../qt/index.js';
import { buildQtPrompt } from '../qt/index.js';

const CONFIG_DIR = join(homedir(), '.codeyang');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface LocalConfig {
  apiKey?: string;
  apiBaseURL?: string;
  apiProvider?: string;
  mcpServers?: Record<string, McpServerConfig>;
}

let localConfig: LocalConfig = {};

export async function loadLocalConfig(): Promise<void> {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    localConfig = JSON.parse(data);
  } catch {
    localConfig = {};
  }
}

export async function saveApiSettings(settings: { apiKey: string; apiBaseURL?: string; apiProvider?: string }): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  localConfig.apiKey = settings.apiKey;
  if (settings.apiBaseURL) localConfig.apiBaseURL = settings.apiBaseURL;
  if (settings.apiProvider) localConfig.apiProvider = settings.apiProvider;
  await writeFile(CONFIG_FILE, JSON.stringify(localConfig, null, 2), 'utf-8');
}

export function getMcpServers(): Record<string, McpServerConfig> {
  return localConfig.mcpServers ?? {};
}

export async function saveMcpServers(servers: Record<string, McpServerConfig>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  localConfig.mcpServers = servers;
  await writeFile(CONFIG_FILE, JSON.stringify(localConfig, null, 2), 'utf-8');
}

let modelOverride: string | undefined;

export function setSessionApiKey(key: string) {
  sessionApiKey = key;
}

let sessionApiKey = '';

export const config = {
  get model() {
    if (modelOverride) return modelOverride;
    return process.env['CODEYANG_MODEL'] || 'deepseek-chat';
  },
  set model(v: string) {
    modelOverride = v;
  },
  get apiKey() {
    return sessionApiKey || process.env['CODEYANG_API_KEY'] || process.env['DEEPSEEK_API_KEY'] || localConfig.apiKey || '';
  },
  get baseURL() {
    return process.env['CODEYANG_BASE_URL'] || localConfig.apiBaseURL || 'https://api.deepseek.com/v1';
  },
  get provider() {
    return localConfig.apiProvider || 'deepseek';
  },
  maxTokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
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
- WebFetch: use for real docs, not speculation`;

