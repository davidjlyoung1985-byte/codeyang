import { resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { toolError } from './errors.js';

/**
 * Resolve a user-supplied path to an absolute path.
 * When CODEX_SANDBOX is set, enforces the path stays inside that directory.
 */
export function resolveSafePath(inputPath: string, cwd?: string): string {
  const base = cwd || process.cwd();
  const resolved = resolve(base, inputPath);
  const sandbox = process.env['CODEX_SANDBOX'];

  if (!sandbox) return resolved; // no sandbox — just resolve

  const absSandbox = resolve(sandbox);

  if (resolved === absSandbox) return resolved;

  // realpath resolves symlinks — use when the path exists
  let real = resolved;
  try {
    real = realpathSync(resolved);
  } catch {
    // path doesn't exist yet (write) — use the resolved form
  }

  const sandboxSep = absSandbox.endsWith(sep) ? absSandbox : absSandbox + sep;
  if (!real.startsWith(sandboxSep) && real !== absSandbox) {
    throw new Error(
      toolError(
        'Security',
        `Path traversal blocked: "${inputPath}" resolves outside sandbox (${absSandbox})`,
        'Keep all file operations inside the sandbox directory.',
      ),
    );
  }
  return resolved;
}

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
export { executeSearch } from './SearchTool.js';
export { executeImageInfo, executeImageToBase64, executeListImages } from './ImageTool.js';
