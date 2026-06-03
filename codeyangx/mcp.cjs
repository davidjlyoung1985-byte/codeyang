/**
 * CodeYangX — Desktop MCP (Model Context Protocol) Support
 * Manages MCP server connections over stdio in Electron's main process.
 */
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.codeyang');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ═══════════════════════════════════════════════════════════════════════════════
// MCP Manager
// ═══════════════════════════════════════════════════════════════════════════════

class DesktopMcpManager {
  constructor() {
    this.clients = new Map();
    this.servers = {};
    this._mcpTools = [];
    this._status = {};
  }

  /** Load MCP server configs from ~/.codeyang/config.json */
  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        this.servers = data.mcpServers || {};
      }
    } catch {
      this.servers = {};
    }
    return this.servers;
  }

  /** Save MCP server configs */
  saveConfig(servers) {
    try {
      let data = {};
      if (fs.existsSync(CONFIG_FILE)) {
        data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
      data.mcpServers = servers;
      if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
      this.servers = servers;
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Connect to all configured MCP servers and discover their tools */
  async initialize() {
    this.loadConfig();

    const serverNames = Object.keys(this.servers);
    if (serverNames.length === 0) return [];

    const initPromises = serverNames.map(async function (name) {
      const cfg = self.servers[name];
      try {
        const transport = new StdioClientTransport({
          command: cfg.command,
          args: cfg.args || [],
          env: cfg.env ? Object.assign({}, process.env, cfg.env) : undefined,
          cwd: cfg.cwd,
          stderr: 'pipe',
        });

        const client = new Client({ name: 'codeyangx-desktop', version: '0.3.0' }, { capabilities: {} });
        await client.connect(transport);

        const result = await client.listTools();
        const tools = result.tools.map(function (t) {
          return {
            serverName: name,
            qualifiedName: 'mcp__' + name + '__' + t.name,
            name: t.name,
            description: t.description || ('MCP tool: ' + t.name),
            inputSchema: t.inputSchema || {},
          };
        });

        self.clients.set(name, { client, transport, tools, connected: true });
        self._status[name] = { connected: true, toolCount: tools.length };
        return tools;
      } catch (err) {
        self._status[name] = { connected: false, error: err.message };
        return [];
      }
    });

    var self = this; // capture for closure
    const results = await Promise.allSettled(initPromises);

    // Refresh the full tool list
    this._mcpTools = this.collectTools();

    return {
      tools: this._mcpTools,
      status: this._status,
      serverCount: serverNames.length,
      connectedCount: Array.from(this.clients.values()).filter(function (c) { return c.connected; }).length,
    };
  }

  get mcpTools() {
    return this._mcpTools;
  }

  get status() {
    return this._status;
  }

  get hasServers() {
    return Object.keys(this.servers).length > 0;
  }

  /** Re-discover tools from all connected servers */
  async refreshTools() {
    const refreshPromises = Array.from(this.clients.entries()).map(async function ([name, entry]) {
      if (!entry.connected) return [];
      try {
        const result = await entry.client.listTools();
        const tools = result.tools.map(function (t) {
          return {
            serverName: name,
            qualifiedName: 'mcp__' + name + '__' + t.name,
            name: t.name,
            description: t.description || ('MCP tool: ' + t.name),
            inputSchema: t.inputSchema || {},
          };
        });
        entry.tools = tools;
        return tools;
      } catch {
        return [];
      }
    });

    await Promise.allSettled(refreshPromises);
    this._mcpTools = this.collectTools();
    return this._mcpTools;
  }

  /** Call a tool on an MCP server */
  async callTool(qualifiedName, args) {
    const match = qualifiedName.match(/^mcp__(.+?)__(.+)$/);
    if (!match) {
      return { output: 'Invalid MCP tool name: ' + qualifiedName, isError: true };
    }

    const [, serverName, toolName] = match;
    const entry = this.clients.get(serverName);

    if (!entry || !entry.connected) {
      return { output: 'MCP server "' + serverName + '" is not connected', isError: true };
    }

    try {
      const result = await entry.client.callTool({ name: toolName, arguments: args || {} });
      const content = result.content;
      const textContent = content
        .filter(function (c) { return c.type === 'text'; })
        .map(function (c) { return c.text || ''; })
        .join('\n');

      return { output: textContent || '(empty response)', isError: result.isError === true };
    } catch (err) {
      return { output: err.message, isError: true };
    }
  }

  /** Shutdown all connections */
  async shutdown() {
    const disconnectPromises = Array.from(this.clients.values()).map(function (entry) {
      try { return entry.client.close(); } catch { /* ignore */ }
    });
    await Promise.allSettled(disconnectPromises);
    this.clients.clear();
    this._mcpTools = [];
    this._status = {};
  }

  collectTools() {
    var all = [];
    for (const [, entry] of this.clients) {
      if (entry.connected) {
        all.push.apply(all, entry.tools);
      }
    }
    return all;
  }
}

// Singleton
let instance = null;

function getMcpManager() {
  if (!instance) instance = new DesktopMcpManager();
  return instance;
}

module.exports = { getMcpManager, DesktopMcpManager };
