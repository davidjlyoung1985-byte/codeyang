/** Prefix for MCP-qualified tool names */
export const MCP_TOOL_PREFIX = 'mcp';

/** Separator used in qualified names: prefix__serverName__toolName */
export const MCP_TOOL_SEPARATOR = '__';

/** Full separator string for convenience: mcp__ */
export const MCP_QUALIFIED_PREFIX = `${MCP_TOOL_PREFIX}${MCP_TOOL_SEPARATOR}`;

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Human-readable name (optional, for display) */
  description?: string;
}

/**
 * Validate an McpServerConfig at runtime.
 * Returns an array of error messages (empty array if valid).
 */
export function validateMcpConfig(config: McpServerConfig): string[] {
  const errors: string[] = [];
  if (!config.command || typeof config.command !== 'string') {
    errors.push('command must be a non-empty string');
  }
  if (config.args !== undefined && !Array.isArray(config.args)) {
    errors.push('args must be an array of strings');
  }
  if (
    config.env !== undefined &&
    (typeof config.env !== 'object' || config.env === null || Array.isArray(config.env))
  ) {
    errors.push('env must be a record of string to string');
  }
  if (config.cwd !== undefined && typeof config.cwd !== 'string') {
    errors.push('cwd must be a string');
  }
  return errors;
}
