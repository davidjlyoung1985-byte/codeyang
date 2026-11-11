import { resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
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

export async function resolveSafePathAsync(inputPath: string, cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const resolved = resolve(base, inputPath);
  const sandbox = process.env['CODEX_SANDBOX'];

  if (!sandbox) return resolved;

  // SECURITY: Resolve symlinks in sandbox base directory
  let absSandbox = resolve(sandbox);
  try {
    absSandbox = await realpath(absSandbox);
  } catch {
    // Sandbox doesn't exist yet, use resolved form
  }

  if (resolved === absSandbox) return resolved;

  // SECURITY: realpath resolves symlinks in target — use when the path exists
  let real = resolved;
  try {
    real = await realpath(resolved);
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

// ─── Core 1.0 additions ────────────────────────────────────────────
// File manipulation + atomic multi-region edits. Pure Node built-ins, so they
// stay bundleable into the single-file CJS artifact the extension ships.
import { executeCopy, executeMove, executeDelete, executeMkdir, executeList, executeExists } from './FileSystemTool.js';
import { executeMultiEdit, type MultiEditOperation } from './MultiEditTool.js';

export { executeCopy, executeMove, executeDelete, executeMkdir, executeList, executeExists, executeMultiEdit };
export type { MultiEditOperation };
export { applyMultiEdit } from './MultiEditTool.js';

/** Core version, baked in at bundle time so the extension can report it. */
export { VERSION } from '../version.js';

/**
 * Anthropic-shaped tool schema. Mirrors what the CLI sends to the Messages API
 * so the extension can forward these definitions verbatim.
 */
export interface SharedToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Dispatcher table: the subset of core tools the extension can run in-process.
 * Kept explicit (rather than derived from the full registry) because the
 * registry pulls in ESM-only deps such as execa that cannot be bundled to CJS.
 */
const SHARED_DISPATCH: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  Copy: (a) => executeCopy(String(a['source'] ?? ''), String(a['destination'] ?? ''), a['overwrite'] === true),
  Move: (a) => executeMove(String(a['source'] ?? ''), String(a['destination'] ?? ''), a['overwrite'] === true),
  Delete: (a) => executeDelete(String(a['path'] ?? ''), a['recursive'] === true, a['force'] === true),
  Mkdir: (a) => executeMkdir(String(a['path'] ?? ''), a['recursive'] !== false),
  List: (a) => executeList(String(a['path'] ?? ''), a['showHidden'] === true, a['details'] === true),
  Exists: (a) => executeExists(String(a['path'] ?? '')),
  MultiEdit: (a) =>
    executeMultiEdit(
      String(a['filePath'] ?? ''),
      Array.isArray(a['edits']) ? (a['edits'] as MultiEditOperation[]) : [],
    ),
};

/** True when `name` is executable through {@link executeSharedTool}. */
export function hasSharedTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SHARED_DISPATCH, name);
}

/** Names of every tool {@link executeSharedTool} accepts. */
export function sharedToolNames(): string[] {
  return Object.keys(SHARED_DISPATCH);
}

/**
 * Execute one of the extension-safe core tools by name.
 * Unknown names return a readable message instead of throwing, so the LLM can
 * recover on its next turn.
 */
export async function executeSharedTool(name: string, args: Record<string, unknown>): Promise<string> {
  const fn = SHARED_DISPATCH[name];
  if (!fn) return `Unknown tool: ${name}. Available: ${sharedToolNames().join(', ')}`;
  return fn(args ?? {});
}

/** Anthropic-format schemas for every tool in {@link executeSharedTool}. */
export function sharedToolSchemas(): SharedToolSchema[] {
  return [
    {
      name: 'Copy',
      description: 'Copy a file or directory to a new location. Supports recursive directory copying.',
      input_schema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file or directory path' },
          destination: { type: 'string', description: 'Destination path' },
          overwrite: { type: 'boolean', description: 'Allow overwriting existing files (default: false)' },
        },
        required: ['source', 'destination'],
      },
    },
    {
      name: 'Move',
      description: 'Move or rename a file or directory. Uses atomic rename when possible.',
      input_schema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file or directory path' },
          destination: { type: 'string', description: 'Destination path' },
          overwrite: { type: 'boolean', description: 'Allow overwriting existing files (default: false)' },
        },
        required: ['source', 'destination'],
      },
    },
    {
      name: 'Delete',
      description: 'Delete a file or directory. Use recursive=true for non-empty directories.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to file or directory to delete' },
          recursive: { type: 'boolean', description: 'Allow deleting non-empty directories (default: false)' },
          force: { type: 'boolean', description: 'Ignore errors if path does not exist (default: false)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'Mkdir',
      description: 'Create a directory. Creates parent directories by default.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to create' },
          recursive: { type: 'boolean', description: 'Create parent directories if needed (default: true)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'List',
      description: 'List directory contents with optional detailed information (size, modified date).',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list' },
          showHidden: { type: 'boolean', description: 'Show hidden files (default: false)' },
          details: { type: 'boolean', description: 'Show detailed information (default: false)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'Exists',
      description: 'Check if a path exists and get basic information (type, size, modified date).',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to check' } },
        required: ['path'],
      },
    },
    {
      name: 'MultiEdit',
      description:
        'Apply several exact-text replacements to one file atomically. ' +
        'All-or-nothing: if any edit fails, nothing is written. Prefer this over ' +
        'multiple Edit calls when touching several regions of the same file.',
      input_schema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file to edit' },
          edits: {
            type: 'array',
            description: 'Ordered list of edits to apply',
            items: {
              type: 'object',
              properties: {
                oldString: { type: 'string', description: 'Exact text to replace' },
                newString: { type: 'string', description: 'Replacement text' },
                replaceAll: { type: 'boolean', description: 'Replace every occurrence (default: false)' },
              },
              required: ['oldString', 'newString'],
            },
          },
        },
        required: ['filePath', 'edits'],
      },
    },
  ];
}
