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
//
// Two different `validateUrl`s existed on this surface and only one of them was
// safe to use as an SSRF gate, so they are now exported under names that say
// which is which:
//
//   validateUrlWithDns  — literal check + DNS lookup. This is what the network
//                         tools use, and what you want. Rejects a public name
//                         that resolves to a private address.
//   validateUrlLiteral  — no DNS. Synchronous, dependency-free, and *not* a
//                         complete SSRF check on its own.
//
// `validateUrl` stays exported as the literal-check alias for backwards
// compatibility with existing imports.
export { isPrivateIP } from './security/ssrf.js';
export { validateUrl as validateUrlLiteral, validateUrl as validateUrl } from './security/ssrf.js';
export { validateUrl as validateUrlWithDns } from './tools/NetworkTool.js';
export { findPathViolations, formatPathViolations } from './tools/pathGuard.js';

// ── Permissions ────────────────────────────────────────────────────────
export { checkPermission, getConfigGeneration } from './permission/index.js';

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
