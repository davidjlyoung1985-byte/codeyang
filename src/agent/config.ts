import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.codeyang');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface LocalConfig {
  apiKey?: string;
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

export const config = {
  model: process.env['CODEYANG_MODEL'] || process.env['CODEX_MODEL'] || 'claude-sonnet-4-20250514',
  get apiKey() {
    return process.env['ANTHROPIC_API_KEY'] || process.env['CODEYANG_API_KEY'] || process.env['CODEX_API_KEY'] || localConfig.apiKey || '';
  },
  maxTokens: Number(process.env['CODEYANG_MAX_TOKENS'] || process.env['CODEX_MAX_TOKENS'] || '8192'),
  systemPrompt: `You are CodeYang, an AI coding agent that helps users write, debug, and understand code.

You have access to tools to accomplish tasks. Use them when appropriate.

Guidelines:
1. First understand the problem before jumping to solutions
2. Write clear, correct, well-structured code
3. Verify your work by reading files and running tests
4. When running bash commands, prefer safe read-only operations first
5. If a command might be destructive, ask the user first
6. Use the right tool for the job`,
};
