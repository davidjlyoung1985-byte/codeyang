---
name: s9-web-sse-support
description: MCP SSE 传输支持 — McpClient 支持 sse/streamable-http
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# MCP SSE Transport

Add SSE and Streamable HTTP transport support to MCP client.

## Context
`src/mcp/McpClient.ts` currently only supports `stdio` transport. The SDK supports SSE and Streamable HTTP for remote servers.

## Tasks

### 1. Update `src/mcp/McpClient.ts`

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Add transport type
type TransportType = 'stdio' | 'sse' | 'streamable-http';

export class McpClient {
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  
  async connect(): Promise<McpToolDef[]> {
    const cfg = this.config;
    const transportType: TransportType = (cfg as any).transport || 'stdio';
    
    switch (transportType) {
      case 'stdio':
        this.transport = new StdioClientTransport({
          command: cfg.command,
          args: cfg.args ?? [],
        });
        break;
      case 'sse':
        this.transport = new SSEClientTransport(new URL((cfg as any).url || 'http://localhost:3000/sse'));
        break;
      case 'streamable-http':
        this.transport = new (await import('@modelcontextprotocol/sdk/client/streamableHttp.js')).StreamableHTTPServerTransport(
          new URL((cfg as any).url || 'http://localhost:3000/mcp')
        );
        break;
      default:
        throw new Error(`Unknown transport: ${transportType}`);
    }
    
    await this.client.connect(this.transport);
    this.isConnected = true;
    
    const result = await this.client.listTools();
    this._tools = (result.tools ?? []).map(t => ({
      serverName: this.serverName,
      qualifiedName: `mcp__${this.serverName}__${t.name}`,
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    
    return this._tools;
  }
}
```

### 2. Update `src/mcp/types.ts`

```typescript
export interface McpServerConfig {
  command?: string;
  args?: string[];
  transport?: 'stdio' | 'sse' | 'streamable-http';
  url?: string;
  env?: Record<string, string>;
  cwd?: string;
}
```

### 3. Update `validateMcpConfig`

Add validation for SSE/HTTP configs:
```typescript
if (cfg.transport && cfg.transport !== 'stdio') {
  if (!cfg.url) errors.push({ field: `mcpServers.${name}.url`, message: 'required for sse/streamable-http transport' });
}
```

### 4. Verify
```bash
npm run check && npm test
```
