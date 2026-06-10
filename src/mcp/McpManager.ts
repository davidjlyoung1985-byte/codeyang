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
  private reconnectState = new Map<string, { attempts: number; timer: ReturnType<typeof setTimeout> | null }>();
  private readonly MAX_RECONNECT = 3;
  private readonly RECONNECT_BASE_MS = 2000;

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
  getServerStatus(name: string): string {
    const cl = this.clients.get(name);
    if (!cl) return 'not_configured';
    if (!cl.connected && this.reconnectState.has(name)) return 'reconnecting';
    return cl.connected ? 'connected' : 'error';
  }

  /**
   * Schedule a reconnect attempt for a disconnected server with exponential backoff.
   */
  private scheduleReconnect(name: string): void {
    const state = this.reconnectState.get(name) ?? { attempts: 0, timer: null };
    state.attempts++;

    if (state.attempts > this.MAX_RECONNECT) {
      console.warn(`[MCP] ${name}: max reconnects reached, giving up`);
      this.reconnectState.delete(name);
      return;
    }

    const delay = this.RECONNECT_BASE_MS * Math.pow(2, state.attempts - 1);
    console.log(`[MCP] ${name}: reconnect in ${delay}ms (attempt ${state.attempts}/${this.MAX_RECONNECT})`);

    state.timer = setTimeout(async () => {
      const cfg = this.serverConfigs.get(name);
      if (!cfg) return;
      try {
        const cl = new McpClient(name, cfg);
        const tools = await cl.connect();
        this.clients.set(name, cl);
        this._allTools = this.collectTools();
        console.log(`[MCP] ${name}: reconnected, ${tools.length} tools`);
        this.reconnectState.delete(name);
      } catch {
        this.scheduleReconnect(name);
      }
    }, delay);

    this.reconnectState.set(name, state);
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
    for (const [, state] of this.reconnectState) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.reconnectState.clear();

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
