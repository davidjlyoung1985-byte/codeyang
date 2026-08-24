# Example 3: MCP Integration

Connect your agent to external services using the Model Context Protocol (MCP).

## What You'll Learn

- MCP server connection
- Exposing external tools to the agent
- Handling MCP resources
- Error handling and retries

## MCP Overview

[Model Context Protocol](https://modelcontextprotocol.io) lets you connect AI agents to external data sources and tools without custom integrations.

## Prerequisites

```bash
npm install
# Install an MCP server (example: filesystem server)
npm install -g @modelcontextprotocol/server-filesystem
```

## Running the Example

```bash
export ANTHROPIC_API_KEY=your-key-here
node examples/03-mcp-integration/index.js
```

## MCP Server Configuration

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"],
      "env": {}
    }
  }
}
```

## Code Walkthrough

### 1. Initialize MCP Client

```typescript
import { MCPClient } from '../../dist/mcp/MCPClient.js';

const mcpClient = new MCPClient();

await mcpClient.connect({
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
});
```

### 2. List Available Tools

```typescript
const tools = await mcpClient.listTools('filesystem');
console.log('Available MCP tools:', tools.map(t => t.name));
// Output: ['read_file', 'write_file', 'list_directory', ...]
```

### 3. Connect to Agent

```typescript
const agent = new Agent({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  mcpClient, // Automatically exposes MCP tools
});
```

Now the agent can use MCP tools like built-in tools!

## Example Queries

```
User: "Read the README.md file"
→ Agent calls MCP filesystem.read_file

User: "List all TypeScript files in src/"
→ Agent calls MCP filesystem.list_directory with filters

User: "Create a new file docs/guide.md"
→ Agent calls MCP filesystem.write_file
```

## Available MCP Servers

Popular MCP servers you can use:

- **@modelcontextprotocol/server-filesystem** - File operations
- **@modelcontextprotocol/server-postgres** - Database queries
- **@modelcontextprotocol/server-github** - GitHub API access
- **@modelcontextprotocol/server-slack** - Slack messaging

See [MCP Servers Registry](https://github.com/modelcontextprotocol/servers) for more.

## Key Concepts

**Protocol**: MCP uses JSON-RPC 2.0 over stdio for communication.

**Discovery**: MCP servers advertise their tools and resources dynamically.

**Isolation**: Each MCP server runs in its own process for security.

**Error Handling**: If an MCP server crashes, the agent continues with remaining tools.

## Best Practices

1. **Validate server output**: MCP servers can return arbitrary data
2. **Set timeouts**: Some operations (database queries) can be slow
3. **Handle disconnections**: Servers may crash or timeout
4. **Use resource templates**: For dynamic resource paths

## Next Steps

- [Example 4: VS Code Extension](../04-vscode-extension/) - Build an IDE integration
- See [src/mcp/](../../src/mcp/) for MCP client implementation
- Read [MCP Specification](https://spec.modelcontextprotocol.io/)
