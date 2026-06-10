import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_QUALIFIED_PREFIX, MCP_TOOL_SEPARATOR, type McpServerConfig } from './types.js';

export interface McpToolDef {
  serverName: string;
  /** Full qualified name: mcp__serverName__toolName */
  qualifiedName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Manages a single MCP server connection over stdio.
 * Handles startup, tool discovery, tool invocation, and shutdown.
 */
export class McpClient {
  private client: Client;
  private transport?: StdioClientTransport;
  private config: McpServerConfig;
  readonly serverName: string;
  private isConnected = false;
  private _tools: McpToolDef[] = [];

  constructor(serverName: string, config: McpServerConfig) {
    this.serverName = serverName;
    this.config = config;
    this.client = new Client({ name: 'codeyang', version: '0.6.0' }, { capabilities: {} });
  }

  get tools(): McpToolDef[] {
    return this._tools;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  /** Start the server and discover tools. Call once at initialization. */
  async connect(): Promise<McpToolDef[]> {
    if (this.isConnected) {
      return this._tools;
    }

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args ?? [],
      env: this.config.env ? ({ ...process.env, ...this.config.env } as Record<string, string>) : undefined,
      cwd: this.config.cwd,
      stderr: 'pipe' as const, // Silence MCP server stderr noise
    });

    await this.client.connect(this.transport);
    this.isConnected = true;

    this._tools = await this.discoverTools();
    return this._tools;
  }

  /** Re-discover tools from the server at runtime. Returns updated tool list. */
  async refreshTools(): Promise<McpToolDef[]> {
    if (!this.isConnected) {
      return [];
    }
    this._tools = await this.discoverTools();
    return this._tools;
  }

  /** Discover tools from the server */
  private async discoverTools(): Promise<McpToolDef[]> {
    const result = await this.client.listTools();
    return result.tools.map((t) => ({
      serverName: this.serverName,
      qualifiedName: `${MCP_QUALIFIED_PREFIX}${this.serverName}${MCP_TOOL_SEPARATOR}${t.name}`,
      name: t.name,
      description: t.description ?? `MCP tool: ${t.name}`,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  /** Call a tool on this server. args are already unqualified (tool name only). */
  async callTool(name: string, args: Record<string, unknown>): Promise<{ output: string; isError: boolean }> {
    if (!this.isConnected) {
      return { output: `MCP server "${this.serverName}" is not connected`, isError: true };
    }

    const result = await this.client.callTool({ name, arguments: args });
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const textContent = content
      .filter((c: { type: string; text?: string }) => c.type === 'text')
      .map((c: { type: string; text?: string }) => c.text ?? '')
      .join('\n');

    return { output: textContent, isError: result.isError === true };
  }

  /** Shutdown the server */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.close();
      }
    } catch {
      // Best effort shutdown
    }
    this.isConnected = false;
    this._tools = [];
  }
}
