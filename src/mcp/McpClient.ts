import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_QUALIFIED_PREFIX, MCP_TOOL_SEPARATOR, type McpServerConfig, type McpTransportType } from './types.js';

/**
 * SECURITY: Whitelist of allowed MCP server executables
 *
 * Only 'node' is allowed by default to execute trusted MCP servers.
 * Dangerous commands like 'python', 'docker', 'npx' are excluded to prevent arbitrary code execution.
 *
 * To use custom MCP servers with other runtimes, users must:
 * 1. Wrap them in a Node.js script, OR
 * 2. Set CODEYANG_MCP_ALLOW_UNSAFE=true (not recommended)
 */
const ALLOWED_MCP_COMMANDS = new Set([
  'node',
  // 'npx' - REMOVED: can download and execute arbitrary npm packages
  // 'python', 'python3' - REMOVED: can execute arbitrary Python code
  // 'docker' - REMOVED: can run arbitrary containers
  // 'deno' - REMOVED: can execute arbitrary TypeScript/JavaScript
  // 'uvx' - REMOVED: can execute arbitrary Python packages
]);

/**
 * SECURITY: Additional unsafe commands allowed only with explicit opt-in
 */
const UNSAFE_MCP_COMMANDS = new Set(['npx', 'python', 'python3', 'docker', 'deno', 'uvx']);

const MCP_ALLOW_UNSAFE = process.env['CODEYANG_MCP_ALLOW_UNSAFE'] === 'true';

if (MCP_ALLOW_UNSAFE) {
  console.warn('[SECURITY WARNING] MCP unsafe commands enabled. This allows npx, python, docker, etc.');
  for (const cmd of UNSAFE_MCP_COMMANDS) {
    ALLOWED_MCP_COMMANDS.add(cmd);
  }
}

/**
 * Validate MCP command against whitelist to prevent arbitrary code execution.
 */
function validateMcpCommand(command: string): void {
  const executable = command.split(/[\\/]/).pop()?.split('.')[0]?.toLowerCase() || '';

  if (!ALLOWED_MCP_COMMANDS.has(executable)) {
    throw new Error(
      `[SECURITY] MCP command "${command}" is not in the allowed list. ` +
        `Allowed commands: ${Array.from(ALLOWED_MCP_COMMANDS).join(', ')}. ` +
        `To enable unsafe commands (npx, python, docker, etc.), set CODEYANG_MCP_ALLOW_UNSAFE=true`,
    );
  }
}

export interface McpToolDef {
  serverName: string;
  /** Full qualified name: mcp__serverName__toolName */
  qualifiedName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Manages a single MCP server connection over stdio, SSE, or Streamable HTTP.
 * Handles startup, tool discovery, tool invocation, and shutdown.
 */
export class McpClient {
  private client: Client;
  private transport?: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
  private config: McpServerConfig;
  readonly serverName: string;
  private isConnected = false;
  private _tools: McpToolDef[] = [];
  /** Callback invoked when the transport disconnects unexpectedly */
  onDisconnect?: (serverName: string) => void;

  constructor(serverName: string, config: McpServerConfig) {
    this.serverName = serverName;
    this.config = config;
    this.client = new Client({ name: 'codeyang', version: '0.7.0' }, { capabilities: {} });
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

    const transportType: McpTransportType = this.config.transport ?? 'stdio';

    switch (transportType) {
      case 'stdio':
        // Validate command against whitelist before launching
        validateMcpCommand(this.config.command ?? '');

        this.transport = new StdioClientTransport({
          command: this.config.command ?? '',
          args: this.config.args ?? [],
          env: this.config.env ? ({ ...process.env, ...this.config.env } as Record<string, string>) : undefined,
          cwd: this.config.cwd,
          stderr: 'pipe' as const, // Silence MCP server stderr noise
        });
        break;
      case 'sse':
        this.transport = new SSEClientTransport(new URL(this.config.url ?? 'http://localhost:3000/sse'));
        break;
      case 'streamable-http':
        this.transport = new StreamableHTTPClientTransport(new URL(this.config.url ?? 'http://localhost:3000/mcp'));
        break;
      default:
        throw new Error(`Unknown transport type: ${this.config.transport}. Supported: stdio, sse, streamable-http`);
    }

    await this.client.connect(this.transport);
    this.isConnected = true;

    // Listen for transport close/error to detect disconnection
    this.transport.onclose = () => {
      if (this.isConnected) {
        this.isConnected = false;
        this._tools = [];
        this.onDisconnect?.(this.serverName);
      }
    };
    this.transport.onerror = () => {
      // onclose will fire after onerror, triggering the disconnect once
    };

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
