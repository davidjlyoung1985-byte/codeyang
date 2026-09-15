/**
 * Shared types for command handlers.
 */
import type { CliUI } from '../ui/CliUI.js';
import type { Agent } from '../agent/Agent.js';
import type { McpManager } from '../mcp/McpManager.js';
import type { RecoveryIntegration } from '../recovery/index.js';

export interface CommandContext {
  ui: CliUI;
  agent: Agent;
  mcpMgr: McpManager;
  currentSessionId: string | undefined;
  recoveryIntegration?: RecoveryIntegration;
  /**
   * Working directory for cwd-sensitive commands (git operations). Defaults to
   * `process.cwd()`. Must be honored so commands never operate on the process's
   * directory instead of the session's — that bug made `/commit` run
   * `git add -A && git commit` in the wrong repo.
   */
  cwd?: string;
}

export type DispatchResult = { handled: boolean; exit?: boolean };

/** Resolve the directory cwd-sensitive commands should operate on. */
export function resolveCwd(ctx: CommandContext): string {
  return ctx.cwd ?? process.cwd();
}
