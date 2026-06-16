import { resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { toolError } from './errors.js';

/**
 * Resolve a user-supplied path to an absolute path.
 * When CODEX_SANDBOX is set, enforces the path stays inside that directory.
 *
 * SECURITY: Resolves symlinks in both target path and sandbox base to prevent bypass
 *
 * Bypass options:
 *   CODEYANG_ALLOW_DRIVES=E,F — whitelist Windows drive letters (colon optional)
 */
export function resolveSafePath(inputPath: string, cwd?: string): string {
  const base = cwd || process.cwd();
  const resolved = resolve(base, inputPath);
  const sandbox = process.env['CODEX_SANDBOX'];

  if (!sandbox) return resolved;

  // SECURITY: Resolve symlinks in sandbox base directory
  let absSandbox = resolve(sandbox);
  try {
    absSandbox = realpathSync(absSandbox);
  } catch {
    // Sandbox doesn't exist yet, use resolved form
  }

  if (resolved === absSandbox) return resolved;

  // SECURITY: realpath resolves symlinks in target — use when the path exists
  let real = resolved;
  try {
    real = realpathSync(resolved);
  } catch {
    // path doesn't exist yet (write) — use the resolved form
  }

  // Sandbox check: path must be inside sandbox directory
  const sandboxSep = absSandbox.endsWith(sep) ? absSandbox : absSandbox + sep;
  const isInsideSandbox = real.startsWith(sandboxSep) || real === absSandbox;

  // Drive whitelist: allows specific drives BUT still requires sandbox check
  const allowDrives = (process.env['CODEYANG_ALLOW_DRIVES'] || '')
    .split(',')
    .map((d) => d.trim().replace(/:?$/, '').toUpperCase())
    .filter(Boolean);

  if (allowDrives.length > 0) {
    const drive = resolved.charAt(0).toUpperCase();
    if (allowDrives.includes(drive)) {
      // Drive is whitelisted, but path must STILL be inside sandbox
      if (!isInsideSandbox) {
        throw new Error(
          toolError(
            'Security',
            `Path traversal blocked: "${inputPath}" is on whitelisted drive ${drive}: but outside sandbox (${absSandbox})`,
            `Whitelisted drives still enforce sandbox boundaries.`,
          ),
        );
      }
      return resolved;
    }
  }

  // Default: enforce sandbox
  if (!isInsideSandbox) {
    throw new Error(
      toolError(
        'Security',
        `Path traversal blocked: "${inputPath}" resolves outside sandbox (${absSandbox})`,
        `To allow: set CODEYANG_NO_SANDBOX=true or CODEYANG_ALLOW_DRIVES=E,F,... (Windows) to whitelist drives.`,
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
