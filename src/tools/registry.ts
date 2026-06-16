import type { ToolDefinition } from '../types.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { McpManager } from '../mcp/McpManager.js';
import type { LLMClient } from '../agent/LLMClient.js';
import { builtinDefinitions } from './definitions/index.js';
import { resolveAlias, fuzzyFindTools } from './aliases.js';
import { validateParams } from './schema-validate.js';
import { claudeCodeTool } from './ClaudeCodeTool.js';

export interface ToolContext {
  anthropicClient: Anthropic | null;
  llmClient: LLMClient | null;
  model: string;
  maxTokens: number;
  cwd: string;
  /** 可选的取消信号，SIGINT 时触发，用于支持子代理取消 */
  signal?: AbortSignal;
}

let currentContext: ToolContext | null = null;
let mcpManager: McpManager | null = null;
let planMode = false;
let mcpTools: ToolDefinition[] = []; // Replaced atomically on refresh
let qtTools: ToolDefinition[] = [];
let mathTools: ToolDefinition[] = [];

/** Lazily-built merged tool list cache. Invalidated when any dynamic tool list changes. */
let allToolsCache: ToolDefinition[] | null = null;

function invalidateAllToolsCache(): void {
  allToolsCache = null;
}

function buildAllTools(): ToolDefinition[] {
  if (!allToolsCache) {
    allToolsCache = [...tools, ...mcpTools, ...qtTools, ...mathTools];
  }
  return allToolsCache;
}

/**
 * Wrap a tool's execute function with JSON Schema parameter validation.
 * Validation errors are returned as a user-facing string so the LLM
 * receives immediate feedback and can correct the call.
 */
function validatedExecute(
  execute: (args: Record<string, unknown>) => Promise<string>,
  schema: Record<string, unknown>,
): (args: Record<string, unknown>) => Promise<string> {
  return async (args) => {
    const schemaErrors = validateParams(args, schema);
    if (schemaErrors.length > 0) {
      return schemaErrors.join('\n');
    }
    return execute(args);
  };
}

/** Default built-in tools (all categories except math, which is dynamic). */
export const tools: ToolDefinition[] = [...builtinDefinitions.map(wrapToolValidation), claudeCodeTool];

/** Apply schema-validation wrapper to a single tool definition. */
function wrapToolValidation(t: ToolDefinition): ToolDefinition {
  return {
    ...t,
    execute: validatedExecute(t.execute, t.parameters),
  };
}

/** Retrieve the current tool context (used by Task tool definition). */
export function getCurrentContext(): ToolContext | null {
  return currentContext;
}

/** Check whether the agent is in planning mode. */
export function isPlanMode(): boolean {
  return planMode;
}

/** Toggle planning mode. When active, the agent plans before executing. */
export function setPlanMode(v: boolean): void {
  planMode = v;
}

export function setToolContext(ctx: ToolContext | null) {
  currentContext = ctx;
}

/** Register the MCP manager so MCP tools can be discovered and called */
export function setMcpManager(mgr: McpManager | null) {
  mcpManager = mgr;
}

/** Rebuild the MCP tool list from the manager. Call after server init or tool refresh. */
let mcpRefreshLock: Promise<void> | null = null;
export async function refreshMcpTools(): Promise<void> {
  // Prevent concurrent refreshes — if already in progress, wait and return
  if (mcpRefreshLock) {
    await mcpRefreshLock;
    return;
  }

  const task = (async () => {
    if (!mcpManager) {
      mcpTools = [];
      invalidateAllToolsCache();
      return;
    }

    const discovered = await mcpManager.refreshTools();
    const newTools: ToolDefinition[] = [];
    for (const t of discovered) {
      const params = t.inputSchema as Record<string, unknown>;
      const rawExecute = async (args: Record<string, unknown>) => {
        if (!mcpManager) {
          return 'MCP manager not available';
        }
        const result = await mcpManager.callTool(t.qualifiedName, args);
        return result.isError ? `[MCP Error] ${result.output}` : result.output;
      };
      newTools.push({
        name: t.qualifiedName,
        description: `[MCP:${t.serverName}] ${t.description}`,
        parameters: params,
        execute: validatedExecute(rawExecute, params),
      });
    }

    // Atomic swap — concurrent readers see either the old list or the new one
    mcpTools = newTools;
    invalidateAllToolsCache();
  })();

  mcpRefreshLock = task;
  try {
    await task;
  } finally {
    mcpRefreshLock = null;
  }
}

/** Register Qt-specific tools. Called when a Qt project is detected. */
export function registerQtTools(toolDefs: ToolDefinition[]): void {
  qtTools = toolDefs.map(wrapToolValidation);
  invalidateAllToolsCache();
}

/** Register math tools dynamically. Replaces any previously registered math tools. */
export function registerMathTools(toolDefs: ToolDefinition[]): void {
  mathTools = toolDefs.map(wrapToolValidation);
  invalidateAllToolsCache();
}

export function getTool(name: string): ToolDefinition | undefined {
  const all = buildAllTools();
  let found = all.find((t) => t.name === name);
  if (!found) {
    const canonical = resolveAlias(name);
    if (canonical) found = all.find((t) => t.name === canonical);
  }
  return found;
}

/** Get all registered tool definitions (built-in + MCP + Qt + Math). */
export function getAllTools(): ToolDefinition[] {
  return buildAllTools();
}

/**
 * Fuzzy-search tool names among all registered tools.
 * Returns up to `max` matching names sorted by relevance.
 */
export function fuzzyFindToolNames(query: string, max = 10): string[] {
  const names = getAllTools().map((t) => t.name);
  return fuzzyFindTools(query, names).slice(0, max);
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
