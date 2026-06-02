import type { McpServerConfig } from './types.js';
import { McpClient, type McpToolDef } from './McpClient.js';

/**
 * Manages multiple MCP server connections.
 * - Connects to all configured servers
 * - Discovers tools from all servers (with prefixed names)
 * - Routes tool calls to the correct server
 */
export class McpManager {
  private clients: Map<string, McpClient> = new Map();
  private serverConfigs: Map<string, McpServerConfig> = new Map();
  private _allTools: McpToolDef[] = [];
  private initialized = false;

  /** Configure MCP servers from config (does not connect yet). */
  configure(servers: Record<string, McpServerConfig>): void {
    // Add new servers, skip already-configured ones
    for (const [name, cfg] of Object.entries(servers)) {
      if (!this.serverConfigs.has(name)) {
        this.serverConfigs.set(name, cfg);
      }
    }
  }

  /** Connect to all configured servers and discover tools. Returns any errors per server. */
  async initialize(
    onStatus?: (serverName: string, status: 'connecting' | 'connected' | 'error', details: string) => void,
  ): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const entries = Array.from(this.serverConfigs.entries());
    for (const [name, cfg] of entries) {
      onStatus?.(name, 'connecting', `Starting ${cfg.command} ${(cfg.args ?? []).join(' ')}`);
      const client = new McpClient(name, cfg);
      this.clients.set(name, client);

      try {
        const tools = await client.connect();
        onStatus?.(name, 'connected', `${tools.length} tools discovered`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onStatus?.(name, 'error', msg);
      }
    }

    this._allTools = this.collectTools();
  }

  /** Get all tools from all connected servers */
  get allTools(): McpToolDef[] {
    return this._allTools;
  }

  /** Get list of server names */
  get serverNames(): string[] {
    return Array.from(this.serverConfigs.keys());
  }

  /** Get status of a specific server */
  getServerStatus(name: string): 'connected' | 'error' | 'not_found' | 'not_configured' {
    const client = this.clients.get(name);
    if (!client) return 'not_configured';
    return client.connected ? 'connected' : 'error';
  }

  /** Re-discover tools from all connected MCP servers.
   *  Each server's tools are refreshed via listTools(), so newly added tools
   *  will be discovered without restarting the session. Returns updated tool list. */
  async refreshTools(): Promise<McpToolDef[]> {
    const results = await Promise.allSettled(Array.from(this.clients.values()).map((c) => c.refreshTools()));
    // Log any refresh failures (but don't block)
    for (const r of results) {
      if (r.status === 'rejected') {
        // Silently ignore individual server refresh failures
      }
    }
    this._allTools = this.collectTools();
    return this._allTools;
  }

  /** Call a tool by its qualified name */
  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<{ output: string; isError: boolean }> {
    // Parse qualified name: mcp__serverName__toolName
    const match = qualifiedName.match(/^mcp__(.+?)__(.+)$/);
    if (!match) {
      return { output: `Invalid MCP tool name: ${qualifiedName}`, isError: true };
    }

    const [, serverName, toolName] = match;
    const client = this.clients.get(serverName);

    if (!client) {
      return { output: `MCP server "${serverName}" not found`, isError: true };
    }

    return client.callTool(toolName, args);
  }

  /** Shutdown all servers */
  async shutdown(): Promise<void> {
    const disconnects = Array.from(this.clients.values()).map((c) => c.disconnect());
    await Promise.allSettled(disconnects);
    this.clients.clear();
    this._allTools = [];
    this.initialized = false;
  }

  /** Whether any servers are configured */
  get hasServers(): boolean {
    return this.serverConfigs.size > 0;
  }

  private collectTools(): McpToolDef[] {
    const tools: McpToolDef[] = [];
    for (const client of this.clients.values()) {
      if (client.connected) {
        tools.push(...client.tools);
      }
    }
    return tools;
  }
}

export { McpClient, type McpToolDef };
