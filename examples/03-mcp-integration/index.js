import { Agent } from '../../dist/agent/Agent.js';
import { MCPClient } from '../../dist/mcp/MCPClient.js';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('🔌 MCP Integration Example\n');

  // Initialize MCP client
  const mcpClient = new MCPClient();

  console.log('Connecting to MCP filesystem server...');

  try {
    await mcpClient.connect({
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    });

    console.log('✅ Connected to MCP server\n');

    // List available tools
    const tools = await mcpClient.listTools('filesystem');
    console.log('Available MCP tools:');
    tools.forEach(tool => console.log(`  - ${tool.name}: ${tool.description}`));
    console.log();

    // Create agent with MCP integration
    const agent = new Agent({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKey: process.env.ANTHROPIC_API_KEY,
      mcpClient,
    });

    // Test queries that use MCP tools
    const queries = [
      'List all markdown files in the current directory',
      'Read the package.json file and tell me the project version',
    ];

    for (const query of queries) {
      console.log(`User: ${query}`);
      console.log('Agent: ');

      const stream = agent.run(query);

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          process.stdout.write(chunk.content);
        } else if (chunk.type === 'tool_use' && chunk.name.startsWith('filesystem.')) {
          console.log(`\n[🔧 MCP Tool: ${chunk.name}]`);
        }
      }

      console.log('\n\n');
    }

    // Cleanup
    await mcpClient.disconnect('filesystem');
    console.log('✨ Example complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nMake sure you have @modelcontextprotocol/server-filesystem installed:');
    console.error('  npm install -g @modelcontextprotocol/server-filesystem');
    process.exit(1);
  }
}

main();
