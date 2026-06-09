---
name: mcp-code-hardening
description: 加固 MCP 代码 — 配置校验、错误处理改进、工具路由健壮性
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Robustness: MCP Code Hardening

You are a code robustness specialist. Your mission is to harden CodeYang's MCP (Model Context Protocol) layer.

## Context

MCP modules: `src/mcp/McpManager.ts`, `src/mcp/McpClient.ts`, `src/mcp/types.ts`

## Tasks

### 1. Fix Fragile Qualified-Name Parsing (`src/mcp/McpManager.ts`)

**Problem**: `callTool()` parses `mcp__server__tool` with a regex. If a server or tool name contains `__`, the regex breaks. Also, the `mcp__` prefix is a magic string duplicated in both McpManager and McpClient.

**Fix**:
- Extract prefix to a shared constant in `src/mcp/types.ts`:
  ```typescript
  export const MCP_TOOL_PREFIX = 'mcp';
  export const MCP_TOOL_SEPARATOR = '__';
  ```
- Update both McpClient.ts and McpManager.ts to import from types.ts
- In `McpManager.callTool()`, use `split(MCP_TOOL_SEPARATOR)` instead of regex, with validation that produces clear error messages
- Validate server name and tool name components don't contain the separator

### 2. Add Config Validation (`src/mcp/types.ts` or `src/mcp/McpClient.ts`)

**Problem**: `McpServerConfig` has no runtime validation. A misconfigured server (missing command, empty args) causes cryptic errors.

**Fix**:
- Add a `validateMcpConfig(config: McpServerConfig): string[]` function that returns error messages
- Call it in `McpManager.configure()` before adding servers, skip invalid configs with a warning
- Validate: command is non-empty string, args is array, env is optional object

### 3. Add Error Recovery in `src/mcp/McpManager.ts`

**Problem**: If one server fails to connect (`initialize()`), the entire initialization doesn't report which servers succeeded/failed clearly.

**Fix**: The code already does `try/catch` per-server with `onStatus` callback, which is good. But:
- Add a `getConnectionErrors(): string[]` method
- In `McpManager.shutdown()`, handle partial initialization (some clients may be null)

### 4. Verify

Run `npm run check` and `npm test` to verify nothing is broken.

## Files to Edit
- `src/mcp/types.ts` — add MCP_TOOL_PREFIX, MCP_TOOL_SEPARATOR, validateMcpConfig
- `src/mcp/McpManager.ts` — use shared constants, add validation, fragile regex→split
- `src/mcp/McpClient.ts` — use shared constants
