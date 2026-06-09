import type { ToolDefinition } from '../types.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { McpManager } from '../mcp/McpManager.js';
import type { LLMClient } from '../agent/LLMClient.js';
import { builtinDefinitions } from './definitions/index.js';

export interface ToolContext {
  anthropicClient: Anthropic | null;
  llmClient: LLMClient | null;
  model: string;
  maxTokens: number;
  cwd: string;
}

let currentContext: ToolContext | null = null;
let mcpManager: McpManager | null = null;
const mcpTools: ToolDefinition[] = [];
const qtTools: ToolDefinition[] = [];
const mathTools: ToolDefinition[] = [];

/** Default built-in tools (all categories except math, which is dynamic). */
export const tools: ToolDefinition[] = [...builtinDefinitions];

/** Retrieve the current tool context (used by Task tool definition). */
export function getCurrentContext(): ToolContext | null {
  return currentContext;
}

export function setToolContext(ctx: ToolContext | null) {
  currentContext = ctx;
}

/** Register the MCP manager so MCP tools can be discovered and called */
export function setMcpManager(mgr: McpManager | null) {
  mcpManager = mgr;
}

/** Rebuild the MCP tool list from the manager. Call after server init or tool refresh. */
export async function refreshMcpTools(): Promise<void> {
  mcpTools.length = 0;
  if (!mcpManager) return;

  const discovered = await mcpManager.refreshTools();
  for (const t of discovered) {
    mcpTools.push({
      name: t.qualifiedName,
      description: `[MCP:${t.serverName}] ${t.description}`,
      parameters: t.inputSchema as Record<string, unknown>,
      execute: async (args: Record<string, unknown>) => {
        if (!mcpManager) {
          return 'MCP manager not available';
        }
        const result = await mcpManager.callTool(t.qualifiedName, args);
        return result.isError ? `[MCP Error] ${result.output}` : result.output;
      },
    });
  }
}

/** Register Qt-specific tools. Called when a Qt project is detected. */
export function registerQtTools(toolDefs: ToolDefinition[]): void {
  qtTools.length = 0;
  qtTools.push(...toolDefs);
}

/** Register math tools dynamically. Replaces any previously registered math tools. */
export function registerMathTools(toolDefs: ToolDefinition[]): void {
  mathTools.length = 0;
  mathTools.push(...toolDefs);
}

export function getTool(name: string): ToolDefinition | undefined {
  return (
    tools.find((t) => t.name === name) ??
    mcpTools.find((t) => t.name === name) ??
    qtTools.find((t) => t.name === name) ??
    mathTools.find((t) => t.name === name)
  );
}

export function toolSchemas(): Array<{
  name: string;
  description: string;
  input_schema: { type: 'object'; properties?: unknown; required?: string[]; [k: string]: unknown };
}> {
  const allTools = [...tools, ...mcpTools, ...qtTools, ...mathTools];
  return allTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as { type: 'object'; properties?: unknown; required?: string[]; [k: string]: unknown },
  }));
}
