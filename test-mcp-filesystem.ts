/**
 * Test: Filesystem MCP server connection
 *
 * Connects to the official @modelcontextprotocol/server-filesystem via the
 * project's McpClient, lists its tools, and calls read_directory on the
 * project root to verify end-to-end tool invocation.
 *
 * Run:
 *   $env:CODEYANG_MCP_ALLOW_UNSAFE="true"; npx tsx test-mcp-filesystem.ts
 */
import { McpClient } from './src/mcp/McpClient.js';
import { McpManager } from './src/mcp/McpManager.js';

const ROOT_DIR = process.cwd();
const SERVER_NAME = 'filesystem';

async function main() {
  const config = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', ROOT_DIR],
    transport: 'stdio' as const,
    description: 'Filesystem access via official MCP server',
  };

  console.log('=== Filesystem MCP connection test ===');
  console.log(`Workspace root: ${ROOT_DIR}\n`);

  // --- Test 1: single McpClient connection ---
  const client = new McpClient(SERVER_NAME, config);
  console.log(`[1] Connecting to "${SERVER_NAME}" (npx @modelcontextprotocol/server-filesystem)...`);
  const tools = await client.connect();
  console.log(`    Connected! Discovered ${tools.length} tools:`);
  for (const t of tools) {
    console.log(`      - ${t.qualifiedName}: ${t.description.split('\n')[0]}`);
  }
  if (tools.length === 0) {
    throw new Error('No tools discovered — connection failed');
  }
  console.log('');

  // --- Test 2: invoke a tool end-to-end ---
  console.log('[2] Calling list_directory on project root...');
  const res = await client.callTool('list_directory', { path: ROOT_DIR });
  if (res.isError) {
    throw new Error(`list_directory failed: ${res.output}`);
  }
  const lineCount = res.output.trim().split('\n').length;
  console.log(`    OK — list_directory returned ${lineCount} lines.`);
  console.log(`    First entries: ${res.output.trim().split('\n').slice(0, 8).join(' | ')}`);
  await client.disconnect();
  console.log('');

  // --- Test 3: McpManager integration ---
  console.log('[3] Testing McpManager integration...');
  const mgr = new McpManager();
  mgr.configure({ filesystem: config });
  await mgr.initialize((name, status) => {
    console.log(`    [event] ${name}: ${status}`);
  });
  console.log(`    Manager tools: ${mgr.allTools.length}`);
  console.log(`    Server status: ${JSON.stringify(mgr.getServerStatus('filesystem'))}`);
  const call = await mgr.callTool('mcp__filesystem__list_directory', { path: ROOT_DIR });
  console.log(
    `    Manager callTool: ${call.isError ? 'ERROR' : 'OK'} (${call.output.trim().split('\n').length} lines)`,
  );
  await mgr.shutdown();

  console.log('\n=== SUCCESS: Filesystem MCP connection verified ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n=== FAILED: Filesystem MCP connection test ===');
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
