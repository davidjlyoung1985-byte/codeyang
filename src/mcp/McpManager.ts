import { MCP_TOOL_SEPARATOR, MCP_QUALIFIED_PREFIX, validateMcpConfig, type McpServerConfig } from './types.js';
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
  /** Tracks connection errors per server (populated during initialize) */
  private _connectionErrors: Map<string, string> = new Map();
  /** Tracks reconnection attempts per server */
  private reconnectAttempts = new Map<string, { count: number; timeout: ReturnType<typeof setTimeout> | null }>();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_MS = 2_000;

  /** Configure MCP servers from config (does not connect yet). */
  configure(servers: Record<string, McpServerConfig>): void {
    // Add new servers, skip already-configured ones
    for (const [name, cfg] of Object.entries(servers)) {
      if (this.serverConfigs.has(name)) {
        continue;
      }
      // Validate config at runtime — skip invalid configs with a warning
      const errors = validateMcpConfig(cfg);
      if (errors.length > 0) {
        console.warn(`[McpManager] Skipping server "${name}" — invalid config: ${errors.join('; ')}`);
        continue;
      }
      this.serverConfigs.set(name, cfg);
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
      client.onDisconnect = (serverName) => this.scheduleReconnect(serverName);
      this.clients.set(name, client);

      try {
        const tools = await client.connect();
        onStatus?.(name, 'connected', `${tools.length} tools discovered`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this._connectionErrors.set(name, msg);
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

  /** Get list of connection errors (server name → error message) */
  getConnectionErrors(): string[] {
    return Array.from(this._connectionErrors.entries()).map(([name, msg]) => `${name}: ${msg}`);
  }

  /** Get status of a specific server */
  getServerStatus(name: string): 'connected' | 'disconnected' | 'error' | 'not_found' | 'not_configured' {
    const client = this.clients.get(name);
    if (!client) return 'not_configured';
    if (!client.connected && this.reconnectAttempts.has(name)) return 'disconnected';
    return client.connected ? 'connected' : 'error';
  }

  /**
   * Schedule a reconnect attempt for a disconnected server with exponential backoff.
   */
  private scheduleReconnect(serverName: string): void {
    const existing = this.reconnectAttempts.get(serverName);
    const count = (existing?.count ?? 0) + 1;

    if (count > this.MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `[McpManager] Server "${serverName}" max reconnection attempts reached (${this.MAX_RECONNECT_ATTEMPTS}). Giving up.`,
      );
      this.reconnectAttempts.delete(serverName);
      return;
    }

    const delay = this.RECONNECT_DELAY_MS * Math.pow(2, count - 1); // Exponential backoff
    console.log(
      `[McpManager] Scheduling reconnect for "${serverName}" in ${delay}ms (attempt ${count}/${this.MAX_RECONNECT_ATTEMPTS})`,
    );

    const timeout = setTimeout(async () => {
      try {
        const config = this.serverConfigs.get(serverName);
        if (!config) return;

        const client = new McpClient(serverName, config);
        client.onDisconnect = (name) => this.scheduleReconnect(name);

        const tools = await client.connect();
        this.clients.set(serverName, client);
        this._allTools = this.collectTools();
        console.log(`[McpManager] Server "${serverName}" reconnected successfully (${tools.length} tools)`);
        this.reconnectAttempts.delete(serverName);
      } catch (err) {
        console.warn(
          `[McpManager] Reconnect attempt ${count} for "${serverName}" failed:`,
          err instanceof Error ? err.message : String(err),
        );
        this.scheduleReconnect(serverName); // Retry with backoff
      }
    }, delay);

    this.reconnectAttempts.set(serverName, { count, timeout });
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
    if (!qualifiedName.startsWith(MCP_QUALIFIED_PREFIX)) {
      return {
        output: `Invalid MCP tool name: "${qualifiedName}" — must start with "${MCP_QUALIFIED_PREFIX}"`,
        isError: true,
      };
    }

    const rest = qualifiedName.slice(MCP_QUALIFIED_PREFIX.length);
    const parts = rest.split(MCP_TOOL_SEPARATOR);

    if (parts.length < 2) {
      return {
        output: `Invalid MCP tool name: "${qualifiedName}" — expected format "${MCP_QUALIFIED_PREFIX}serverName${MCP_TOOL_SEPARATOR}toolName"`,
        isError: true,
      };
    }

    // First part is the server name; the rest (rejoined) is the tool name
    // This handles tool names that may contain the separator
    const serverName = parts[0];
    const toolName = parts.slice(1).join(MCP_TOOL_SEPARATOR);

    if (!serverName || !toolName) {
      return {
        output: `Invalid MCP tool name: "${qualifiedName}" — server name and tool name must not be empty`,
        isError: true,
      };
    }

    const client = this.clients.get(serverName);

    if (!client) {
      return { output: `MCP server "${serverName}" not found`, isError: true };
    }

    return client.callTool(toolName, args);
  }

  /** Shutdown all servers */
  async shutdown(): Promise<void> {
    // Cancel any pending reconnect attempts
    for (const [, entry] of this.reconnectAttempts) {
      if (entry.timeout) clearTimeout(entry.timeout);
    }
    this.reconnectAttempts.clear();

    const disconnects = Array.from(this.clients.values()).map((c) => c.disconnect());
    await Promise.allSettled(disconnects);
    this.clients.clear();
    this._allTools = [];
    this._connectionErrors.clear();
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
