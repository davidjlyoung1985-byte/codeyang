export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Human-readable name (optional, for display) */
  description?: string;
}
