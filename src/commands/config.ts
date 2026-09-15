/**
 * Configuration commands: /model, /config, /reload, /mcp
 */
import type { CommandContext, DispatchResult } from './types.js';
import { config, getMcpServers, reloadConfig } from '../agent/config.js';

export function cmdModel(line: string, ctx: CommandContext): DispatchResult {
  const model = line.slice(7).trim();
  if (!model) {
    console.log(`  Current model: ${config.model}`);
  } else {
    config.model = model;
    console.log(`  Model set to: ${model}`);
  }
  ctx.ui.promptUser();
  return { handled: true };
}

export function cmdConfig(ctx: CommandContext): DispatchResult {
  console.log('\n  Current Configuration:');
  console.log(`  Model: ${config.model}`);
  console.log(`  Base URL: ${config.baseURL}`);
  console.log(`  Max Tokens: ${config.maxTokens.toLocaleString()}`);
  console.log(`  Provider: ${config.provider}`);
  console.log(`  API Key: ${config.apiKey ? '********' : '(not set)'}`);
  console.log('');
  ctx.ui.promptUser();
  return { handled: true };
}

export async function cmdReload(ctx: CommandContext): Promise<DispatchResult> {
  await reloadConfig();
  console.log('  Configuration reloaded from disk.');
  ctx.ui.promptUser();
  return { handled: true };
}

export function cmdMcp(ctx: CommandContext): DispatchResult {
  const servers = getMcpServers();
  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    console.log('  No MCP servers configured.');
  } else {
    console.log(`\n  MCP Servers (${serverNames.length}):`);
    for (const name of serverNames) {
      const s = servers[name];
      console.log(`  · ${name}`);
      console.log(`    ${s.command} ${s.args?.join(' ') || ''}`);
    }
    console.log('');
  }
  ctx.ui.promptUser();
  return { handled: true };
}
