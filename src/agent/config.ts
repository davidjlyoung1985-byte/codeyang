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
2. For complex multi-step tasks, use TodoWrite to create a task list and track progress
3. Write clear, correct, well-structured code
4. Verify your work by reading files and running tests
5. When running bash commands, prefer safe read-only operations first
6. If a command might be destructive, ask the user first
7. Use WebFetch to read online documentation when needed
8. Use the Read tool to explore directory structures
9. Use the right tool for the job
10. Be direct and concise — do not repeat yourself or restate what was already said
11. Avoid filler phrases like "let me look at this" — just show the result
12. Never output the same sentence or paragraph twice in a single response`,
};
