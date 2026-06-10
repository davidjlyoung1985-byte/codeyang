---
name: s2-mcp-reconnect
description: MCP 自动重连 — 指数退避重试 + 状态管理
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# MCP Auto-Reconnect

Add automatic reconnection for MCP servers.

## Tasks

### 1. Add reconnect to `src/mcp/McpManager.ts`

```typescript
private reconnectState = new Map<string, { attempts: number; timer: ReturnType<typeof setTimeout> | null }>();
private readonly MAX_RECONNECT = 3;
private readonly RECONNECT_BASE_MS = 2000;

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
      const cl = new (await import('./McpClient.js')).McpClient(name, cfg);
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
```

### 2. Update `getServerStatus`
```typescript
getServerStatus(name: string): string {
  const cl = this.clients.get(name);
  if (!cl) return 'not_configured';
  if (!cl.connected && this.reconnectState.has(name)) return 'reconnecting';
  return cl.connected ? 'connected' : 'error';
}
```

### 3. Cancel reconnects on shutdown
In `shutdown()`:
```typescript
for (const [, state] of this.reconnectState) {
  if (state.timer) clearTimeout(state.timer);
}
this.reconnectState.clear();
```

### 4. Verify
```bash
npm run check && npm test
```
