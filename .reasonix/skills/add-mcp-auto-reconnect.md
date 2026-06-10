---
name: add-mcp-auto-reconnect
description: MCP 自动重连 — 断线时自动重试连接 MCP 服务器
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# MCP Auto-Reconnect

You are a resilience specialist. Add automatic reconnection logic for MCP servers.

## Context

`src/mcp/McpManager.ts` connects MCP servers once at startup. If a server disconnects (process crash, network issue), tools from that server silently fail. Add auto-reconnection.

## Tasks

### 1. Add Reconnect Logic in `src/mcp/McpManager.ts`

```typescript
private reconnectAttempts = new Map<string, { count: number; timeout: ReturnType<typeof setTimeout> | null }>();
private readonly MAX_RECONNECT_ATTEMPTS = 3;
private readonly RECONNECT_DELAY_MS = 2_000;

/**
 * Schedule a reconnect attempt for a disconnected server.
 */
private scheduleReconnect(serverName: string): void {
  const existing = this.reconnectAttempts.get(serverName);
  const count = (existing?.count ?? 0) + 1;
  
  if (count > this.MAX_RECONNECT_ATTEMPTS) {
    console.warn(`[McpManager] Server "${serverName}" max reconnection attempts reached (${this.MAX_RECONNECT_ATTEMPTS}). Giving up.`);
    this.reconnectAttempts.delete(serverName);
    return;
  }
  
  const delay = this.RECONNECT_DELAY_MS * Math.pow(2, count - 1); // Exponential backoff
  console.log(`[McpManager] Scheduling reconnect for "${serverName}" in ${delay}ms (attempt ${count}/${this.MAX_RECONNECT_ATTEMPTS})`);
  
  const timeout = setTimeout(async () => {
    try {
      const config = this.serverConfigs.get(serverName);
      if (!config) return;
      
      const client = new McpClient(serverName, config);
      const tools = await client.connect();
      this.clients.set(serverName, client);
      this._allTools = this.collectTools();
      console.log(`[McpManager] Server "${serverName}" reconnected successfully (${tools.length} tools)`);
      this.reconnectAttempts.delete(serverName);
    } catch (err) {
      console.warn(`[McpManager] Reconnect attempt ${count} for "${serverName}" failed:`, err instanceof Error ? err.message : String(err));
      this.scheduleReconnect(serverName); // Retry
    }
  }, delay);
  
  this.reconnectAttempts.set(serverName, { count, timeout });
}
```

### 2. Add `getServerStatus()` Enhancement

Update status to include `'disconnected'`:
```typescript
getServerStatus(name: string): 'connected' | 'disconnected' | 'error' | 'not_found' | 'not_configured' {
  const client = this.clients.get(name);
  if (!client) return 'not_configured';
  if (!client.connected && this.reconnectAttempts.has(name)) return 'disconnected';
  return client.connected ? 'connected' : 'error';
}
```

### 3. Update `_allTools` on Status Change

Ensure `collectTools()` excludes disconnected servers' tools:
```typescript
private collectTools(): McpToolDef[] {
  const tools: McpToolDef[] = [];
  for (const client of this.clients.values()) {
    if (client.connected) {
      tools.push(...client.tools);
    }
  }
  return tools;
}
```

### 4. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/mcp/McpManager.ts` — add reconnect logic
