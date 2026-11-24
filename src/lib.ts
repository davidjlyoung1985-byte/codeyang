/**
 * Library entry point.
 *
 * `src/index.ts` is the CLI (`#!/usr/bin/env node`, zero exports), so
 * `import ... from 'codeyang'` resolved to a module with nothing in it.
 * This file is the actual public API surface for programmatic use.
 *
 * Design rule: only re-export things that are safe to load. Nothing here may
 * read stdin, start a server, spawn processes or call process.exit at import
 * time — importing a library must not have side effects.
 */

// ── Agent ──────────────────────────────────────────────────────────────
export { Agent } from './agent/Agent.js';
export type { AgentCallbacks } from './agent/Agent.js';
export { createLLMClient } from './agent/LLMClient.js';
export type { LLMClient } from './agent/LLMClient.js';

// ── Tools ──────────────────────────────────────────────────────────────
export { tools, getTool, toolSchemas } from './tools/registry.js';
export type { ToolContext } from './tools/registry.js';

// ── Security ───────────────────────────────────────────────────────────
export { isPrivateIP, validateUrl } from './security/ssrf.js';
export { findPathViolations, formatPathViolations } from './tools/pathGuard.js';

// ── Permissions ────────────────────────────────────────────────────────
export { checkPermission } from './permission/index.js';

// ── Configuration ──────────────────────────────────────────────────────
export { loadConfig, getConfig, reloadConfig, clearConfigCache, type Config } from './config/index.js';
export { ENV_SPECS, getEnvSpec, envNames, envByCategory } from './config/env.js';
export type { EnvSpec, EnvKind, EnvCategory } from './config/env.js';
export { envString, envInt, envFloat, envBool, envList, envSecret } from './config/envReader.js';
export { renderEnvHelp } from './config/envHelp.js';

// ── Errors ─────────────────────────────────────────────────────────────
export { CodeYangError, ErrorCode } from './errors/index.js';

// ── Types ──────────────────────────────────────────────────────────────
export type { Message, ToolCall, ToolResult, ToolDefinition } from './types.js';

// ── Version ────────────────────────────────────────────────────────────
export { VERSION } from './version.js';
