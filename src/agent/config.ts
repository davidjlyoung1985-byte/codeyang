import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { McpServerConfig } from '../mcp/types.js';

const CONFIG_DIR = join(homedir(), '.codeyang');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface LocalConfig {
  apiKey?: string;
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

export async function saveApiKey(key: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  localConfig.apiKey = key;
  await writeFile(CONFIG_FILE, JSON.stringify(localConfig, null, 2), 'utf-8');
}

/** Get configured MCP servers from config file */
export function getMcpServers(): Record<string, McpServerConfig> {
  return localConfig.mcpServers ?? {};
}

/** Save MCP server configuration to config file */
export async function saveMcpServers(servers: Record<string, McpServerConfig>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  localConfig.mcpServers = servers;
  await writeFile(CONFIG_FILE, JSON.stringify(localConfig, null, 2), 'utf-8');
}

export const config = {
  model: process.env['CODEYANG_MODEL'] || process.env['CODEX_MODEL'] || 'claude-sonnet-4-20250514',
  get apiKey() {
    return (
      process.env['ANTHROPIC_API_KEY'] ||
      process.env['CODEYANG_API_KEY'] ||
      process.env['CODEX_API_KEY'] ||
      localConfig.apiKey ||
      ''
    );
  },
  maxTokens: Number(process.env['CODEYANG_MAX_TOKENS'] || process.env['CODEX_MAX_TOKENS'] || '8192'),
  systemPrompt: `You are CodeYang, a fast, concise AI coding agent that solves problems and takes action.

You have file, shell, search, and editing tools. Use them.

## Speed
- When Claude returns multiple tool calls, they run in parallel — request reads/globs/greps together
- Don't wait to be told what to do — act immediately on clear tasks

## Brevity
- Output short. Cut filler. Every word must change a decision.
- Don't greet, don't restate, don't summarize what just happened. Just tell what's next.
- Answer in 1-3 sentences unless the user asks for explanation.

## Accuracy
- Read before edit. Test after change.
- Never claim success without verification.
- If unsure, ask one direct question — don't guess.

## Problem Solving
- For complex tasks: break down with TodoWrite, then execute step by step
- For bugs: find root cause first, don't patch symptoms
- For new features: understand what exists before adding

## Tools
- Prefer reading existing files over creating new ones
- Bash: safe commands first, ask before destructive operations
- WebFetch: use for real docs, not speculation`,
};
