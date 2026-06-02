/**
 * Shared tool barrel — used by VS Code extension (CommonJS).
 * Exports all tool execute functions that don't require ESM-only deps.
 *
 * Note: BashTool uses execa (ESM only), so the extension keeps its own
 * implementation using child_process. GrepTool uses execa for ripgrep
 * detection but wraps it with a try-catch that falls back to Node.js.
 */
export { executeRead } from './ReadTool.js';
export { executeWrite } from './WriteTool.js';
export { executeEdit } from './EditTool.js';
export { executeGlob, matchGlob } from './GlobTool.js';
export { executeGrep } from './GrepTool.js';
export { executeTodoWrite, getTodos, resetTodos } from './TodoWriteTool.js';
export { executeWebFetch } from './WebFetchTool.js';
