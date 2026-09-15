/**
 * MATLAB MCP server commands: /matlab
 */
import type { CommandContext, DispatchResult } from './types.js';

export async function cmdMatlab(ctx: CommandContext): Promise<DispatchResult> {
  const { saveMcpServers, getMcpServers } = await import('../agent/config.js');
  const servers = getMcpServers();
  if (servers['matlab']) {
    console.log('  MATLAB MCP server is already configured.');
    console.log('  Restart CodeYang to apply.');
  } else {
    servers['matlab'] = {
      command: 'npx',
      args: ['tsx', 'mcp-servers/matlab/server.ts'],
    };
    await saveMcpServers(servers);
    console.log('  ✅ MATLAB MCP server configured.');
    console.log('  Restart CodeYang to connect.');
  }
  ctx.ui.promptUser();
  return { handled: true };
}
