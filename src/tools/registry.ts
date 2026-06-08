import type { Method } from 'axios';
import type { ToolDefinition } from '../types.js';
import { executeBash } from './BashTool.js';
import { executeRead } from './ReadTool.js';
import { executeWrite } from './WriteTool.js';
import { executeEdit } from './EditTool.js';
import { executeGlob } from './GlobTool.js';
import { executeGrep } from './GrepTool.js';
import { executeTodoWrite } from './TodoWriteTool.js';
import { executeWebFetch } from './WebFetchTool.js';
import { executeTask } from './TaskTool.js';
import { executeCopy, executeMove, executeDelete, executeMkdir, executeList, executeExists } from './FileSystemTool.js';
import {
  executeJsonParse,
  executeJsonWrite,
  executeJsonQuery,
  executeYamlParse,
  executeYamlWrite,
  executeConvert,
  executeCsvParse,
  executeCsvWrite,
  executeXmlParse,
  executeXmlWrite,
} from './DataTool.js';
import {
  executeGitStatus,
  executeGitDiff,
  executeGitCommit,
  executeGitBranch,
  executeGitCheckout,
  executeGitLog,
  executeGitPush,
  executeGitPull,
  executeGitClone,
  executeGitAdd,
  executeGitReset,
  executeGitStash,
  executeGitMerge,
  executeGitRemote,
  executeGitCurrentBranch,
  executeGitBlame,
} from './GitTool.js';
import {
  executeParseAst,
  executeAnalyzeCode,
  executeComplexity,
  executeLint,
  executeFindDeps,
  executeCountLines,
} from './CodeAnalysisTool.js';
import {
  executeHttpRequest,
  executeDownloadFile,
  executeUploadFile,
  executeApiCall,
  executeCheckUrl,
  executeParseUrl,
} from './NetworkTool.js';
import { executeMathSolve } from '../math/MathSolve.js';
import { executeMathPlot } from '../math/MathPlot.js';
import { executeMathExplain } from '../math/MathExplain.js';
import { executeSearch } from './SearchTool.js';
import { executeImageInfo, executeImageToBase64, executeListImages } from './ImageTool.js';
import { executeRemember, executeRecall, executeForget, executeListMemories } from './MemoryTool.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { McpManager } from '../mcp/McpManager.js';

export interface ToolContext {
  anthropicClient: Anthropic | null;
  model: string;
  maxTokens: number;
  cwd: string;
}

let currentContext: ToolContext | null = null;
let mcpManager: McpManager | null = null;
const mcpTools: ToolDefinition[] = [];
const qtTools: ToolDefinition[] = [];

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

export const tools: ToolDefinition[] = [
  {
    name: 'Bash',
    description: 'Execute a shell command. Use for running code, tests, file operations, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout_secs: { type: 'number', description: 'Timeout in seconds (default: 30). Use higher for builds.' },
      },
      required: ['command'],
    },
    execute: async (args) => {
      const command = String(args['command'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const timeoutSecs = args['timeout_secs'] !== undefined ? Number(args['timeout_secs']) : undefined;
      return executeBash(command, cwd, timeoutSecs);
    },
  },
  {
    name: 'Read',
    description:
      'Read the contents of a file or list a directory. For files, optionally specify offset and limit for large files. For directories, returns a listing with entries sorted alphabetically (directories first).',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file' },
        offset: { type: 'number', description: 'Starting line (0-indexed)' },
        limit: { type: 'number', description: 'Number of lines to read' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const offset = args['offset'] !== undefined ? Number(args['offset']) : undefined;
      const limit = args['limit'] !== undefined ? Number(args['limit']) : undefined;
      return executeRead(filePath, offset, limit);
    },
  },
  {
    name: 'Write',
    description: 'Write content to a file. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['filePath', 'content'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const content = String(args['content'] ?? '');
      return executeWrite(filePath, content);
    },
  },
  {
    name: 'Edit',
    description:
      'Edit a file by replacing exact text. Use for surgical code changes. Provide enough context in oldString for a unique match. Use replaceAll for renaming across the file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file to edit' },
        oldString: { type: 'string', description: 'The exact text to replace' },
        newString: { type: 'string', description: 'The replacement text' },
        replaceAll: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
      },
      required: ['filePath', 'oldString', 'newString'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const oldString = String(args['oldString'] ?? '');
      const newString = String(args['newString'] ?? '');
      const replaceAll = args['replaceAll'] === true;
      return executeEdit(filePath, oldString, newString, replaceAll);
    },
  },
  {
    name: 'Glob',
    description: 'Search for files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts")' },
        root: { type: 'string', description: 'Root directory (optional)' },
      },
      required: ['pattern'],
    },
    execute: async (args) => {
      const pattern = String(args['pattern'] ?? '');
      const root = args['root'] ? String(args['root']) : undefined;
      return executeGlob(pattern, root);
    },
  },
  {
    name: 'Grep',
    description: 'Search file contents for a regex pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search' },
        include: { type: 'string', description: 'File glob filter (e.g. "*.ts")' },
        path: { type: 'string', description: 'Directory to search (optional)' },
        context_lines: { type: 'number', description: 'Lines of context around each match (default: 0)' },
      },
      required: ['pattern'],
    },
    execute: async (args) => {
      const pattern = String(args['pattern'] ?? '');
      const include = args['include'] ? String(args['include']) : undefined;
      const path = args['path'] ? String(args['path']) : undefined;
      const contextLines = args['context_lines'] !== undefined ? Number(args['context_lines']) : 0;
      return executeGrep(pattern, include, path, contextLines);
    },
  },
  {
    name: 'TodoWrite',
    description:
      'Create and maintain a structured task list for the current coding session. ' +
      'Tracks progress, organizes multi-step work, and surfaces status to the user. ' +
      'Use proactively when: the task requires 3+ distinct steps; the work is non-trivial; ' +
      'the user provides multiple tasks. Skip when the work is a single straightforward task.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Brief description of the task' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                description: 'Current status',
              },
              priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level' },
            },
            required: ['content', 'status', 'priority'],
          },
          description: 'The updated todo list',
        },
      },
      required: ['todos'],
    },
    execute: async (args) => {
      const todos = (args['todos'] as Array<Record<string, unknown>>) ?? [];
      return executeTodoWrite(
        todos.map((t) => ({
          content: String(t.content ?? ''),
          status: (t.status as 'pending' | 'in_progress' | 'completed' | 'cancelled') || 'pending',
          priority: (t.priority as 'high' | 'medium' | 'low') || 'medium',
        })),
      );
    },
  },
  {
    name: 'WebFetch',
    description:
      'Fetches content from a specified URL and returns it as text. ' +
      'Use for reading online documentation, API references, or any web resource. ' +
      'Accepts HTTP and HTTPS URLs. Content is automatically converted from HTML to readable text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch content from' },
        format: { type: 'string', enum: ['text', 'html'], description: 'Output format (default: text)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const format = args['format'] ? String(args['format']) : undefined;
      return executeWebFetch(url, format);
    },
  },
  {
    name: 'Task',
    description:
      'Launch a sub-agent to handle a task autonomously. ' +
      'Two modes: (1) prompt — single instruction string for simple tasks; ' +
      '(2) subtasks array — multiple parallel subtasks for complex work. ' +
      'Sub-agents run in parallel. Question and Task tools are disabled inside sub-agents.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short description (3-5 words)' },
        prompt: {
          type: 'string',
          description: 'Single instruction for the sub-agent (use instead of subtasks for simple tasks)',
        },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of parallel subtask instructions (use instead of prompt for multi-step work)',
        },
      },
      required: ['description'],
    },
    execute: async (args) => {
      const desc = String(args['description'] ?? '');
      const prompt = args['prompt'] ? String(args['prompt']) : undefined;
      const subtasks = prompt ? [prompt] : ((args['subtasks'] as string[]) ?? []);

      if (!currentContext) {
        return 'Task sub-agent is not available: no tool context configured.';
      }

      const { anthropicClient, model, maxTokens, cwd } = currentContext;
      if (!anthropicClient) {
        return 'Task sub-agent is not available when using non-Anthropic providers.';
      }
      return executeTask(anthropicClient, model, maxTokens, desc, subtasks, cwd);
    },
  },
  {
    name: 'Question',
    description: 'Ask the user a question when you need clarification or a decision.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Display text for the option' },
              description: { type: 'string', description: 'Explanation of what choosing this option means' },
            },
            required: ['label', 'description'],
          },
          description: 'Available choices (optional)',
        },
      },
      required: ['question'],
    },
    execute: async (args) => {
      const q = String(args['question'] ?? '');
      const options = args['options'] as Array<{ label: string; description: string }> | undefined;
      if (options && options.length > 0) {
        const opts = options.map((o, i) => `  ${i + 1}. ${o.label} 鈥?${o.description}`).join('\n');
        return `[QUESTION] ${q}\n\nOptions:\n${opts}`;
      }
      return `[QUESTION] ${q}`;
    },
  },
  {
    name: 'Remember',
    description:
      'Save a fact, preference, or piece of information to persistent memory. Use for user preferences, project details, decisions, or anything worth remembering across sessions.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'A short, descriptive key (e.g. "user_name", "project_goal", "preferred_test_framework")',
        },
        value: { type: 'string', description: 'The content to remember' },
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'project', 'instruction', 'context'],
          description: 'Category of memory (default: fact)',
        },
      },
      required: ['key', 'value'],
    },
    execute: async (args) => executeRemember(args),
  },
  {
    name: 'Recall',
    description: 'Retrieve memories by key, id, or search query. Returns matching memories from persistent storage.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID to retrieve (optional)' },
        query: { type: 'string', description: 'Search query to find related memories (optional)' },
      },
    },
    execute: async (args) => executeRecall(args),
  },
  {
    name: 'Forget',
    description: 'Delete a memory by its key or id.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key or id to delete' },
      },
      required: ['key'],
    },
    execute: async (args) => executeForget(args),
  },
  {
    name: 'ListMemories',
    description: 'List all saved memories, optionally filtered by type.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'project', 'instruction', 'context'],
          description: 'Filter by type (optional)',
        },
      },
    },
    execute: async (args) => executeListMemories(args),
  },
  {
    name: 'Copy',
    description: 'Copy a file or directory to a new location. Supports recursive directory copying.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file or directory path' },
        destination: { type: 'string', description: 'Destination path' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing files (default: false)' },
      },
      required: ['source', 'destination'],
    },
    execute: async (args) => {
      const source = String(args['source'] ?? '');
      const destination = String(args['destination'] ?? '');
      const overwrite = args['overwrite'] === true;
      return executeCopy(source, destination, overwrite);
    },
  },
  {
    name: 'Move',
    description: 'Move or rename a file or directory. Uses atomic rename when possible, falls back to copy+delete.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file or directory path' },
        destination: { type: 'string', description: 'Destination path' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing files (default: false)' },
      },
      required: ['source', 'destination'],
    },
    execute: async (args) => {
      const source = String(args['source'] ?? '');
      const destination = String(args['destination'] ?? '');
      const overwrite = args['overwrite'] === true;
      return executeMove(source, destination, overwrite);
    },
  },
  {
    name: 'Delete',
    description: 'Delete a file or directory. Use recursive=true for non-empty directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to file or directory to delete' },
        recursive: { type: 'boolean', description: 'Allow deleting non-empty directories (default: false)' },
        force: { type: 'boolean', description: 'Ignore errors if path does not exist (default: false)' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const targetPath = String(args['path'] ?? '');
      const recursive = args['recursive'] === true;
      const force = args['force'] === true;
      return executeDelete(targetPath, recursive, force);
    },
  },
  {
    name: 'Mkdir',
    description: 'Create a directory. Creates parent directories by default.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' },
        recursive: { type: 'boolean', description: 'Create parent directories if needed (default: true)' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const dirPath = String(args['path'] ?? '');
      const recursive = args['recursive'] !== false; // default true
      return executeMkdir(dirPath, recursive);
    },
  },
  {
    name: 'List',
    description: 'List directory contents with optional detailed information (size, modified date).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        showHidden: { type: 'boolean', description: 'Show hidden files (starting with .) (default: false)' },
        details: { type: 'boolean', description: 'Show detailed information (size, date) (default: false)' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const dirPath = String(args['path'] ?? '');
      const showHidden = args['showHidden'] === true;
      const details = args['details'] === true;
      return executeList(dirPath, showHidden, details);
    },
  },
  {
    name: 'Exists',
    description: 'Check if a path exists and get basic information (type, size, modified date).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to check' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const targetPath = String(args['path'] ?? '');
      return executeExists(targetPath);
    },
  },
  {
    name: 'JsonParse',
    description: 'Parse JSON from a file or string and return formatted output.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or JSON string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeJsonParse(input, isFile);
    },
  },
  {
    name: 'JsonWrite',
    description: 'Write JSON data to a file with optional pretty formatting.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON data to write (as string or object)' },
        pretty: { type: 'boolean', description: 'Pretty-print with indentation (default: true)' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      const pretty = args['pretty'] !== false;
      return executeJsonWrite(filePath, data, pretty);
    },
  },
  {
    name: 'JsonQuery',
    description: 'Query JSON using dot notation (e.g., "users[0].name" or "config.database.host").',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or JSON string' },
        query: { type: 'string', description: 'Dot notation query path' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input', 'query'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const query = String(args['query'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeJsonQuery(input, query, isFile);
    },
  },
  {
    name: 'YamlParse',
    description: 'Parse YAML from a file or string and return as JSON.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or YAML string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeYamlParse(input, isFile);
    },
  },
  {
    name: 'YamlWrite',
    description: 'Write data to a YAML file. Input must be valid JSON.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON data to convert to YAML' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      return executeYamlWrite(filePath, data);
    },
  },
  {
    name: 'Convert',
    description: 'Convert between JSON and YAML formats.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or data string' },
        fromFormat: { type: 'string', enum: ['json', 'yaml'], description: 'Source format' },
        toFormat: { type: 'string', enum: ['json', 'yaml'], description: 'Target format' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input', 'fromFormat', 'toFormat'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const fromFormat = String(args['fromFormat'] ?? '') as 'json' | 'yaml';
      const toFormat = String(args['toFormat'] ?? '') as 'json' | 'yaml';
      const isFile = args['isFile'] !== false;
      return executeConvert(input, fromFormat, toFormat, isFile);
    },
  },
  {
    name: 'CsvParse',
    description: 'Parse CSV from a file or string and return as JSON array.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or CSV string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
        hasHeader: { type: 'boolean', description: 'First row is header (default: true)' },
        delimiter: { type: 'string', description: 'Field delimiter (default: ",")' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      const hasHeader = args['hasHeader'] !== false;
      const delimiter = args['delimiter'] ? String(args['delimiter']) : ',';
      return executeCsvParse(input, isFile, hasHeader, delimiter);
    },
  },
  {
    name: 'CsvWrite',
    description: 'Write JSON array to a CSV file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON array data' },
        hasHeader: { type: 'boolean', description: 'Include header row (default: true)' },
        delimiter: { type: 'string', description: 'Field delimiter (default: ",")' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      const hasHeader = args['hasHeader'] !== false;
      const delimiter = args['delimiter'] ? String(args['delimiter']) : ',';
      return executeCsvWrite(filePath, data, hasHeader, delimiter);
    },
  },
  {
    name: 'XmlParse',
    description: 'Parse XML from a file or string and return as JSON.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or XML string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeXmlParse(input, isFile);
    },
  },
  {
    name: 'XmlWrite',
    description: 'Write JSON data to an XML file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON data to convert to XML' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      return executeXmlWrite(filePath, data);
    },
  },
  {
    name: 'GitStatus',
    description: 'Get git repository status. Shows modified, staged, and untracked files.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        short: { type: 'boolean', description: 'Use short format (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const short = args['short'] === true;
      return executeGitStatus(cwd, short);
    },
  },
  {
    name: 'GitDiff',
    description: 'Show git diff. Can show unstaged or staged changes, optionally for a specific file.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        staged: { type: 'boolean', description: 'Show staged changes (default: false)' },
        filePath: { type: 'string', description: 'Specific file to diff (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const staged = args['staged'] === true;
      const filePath = args['filePath'] ? String(args['filePath']) : undefined;
      return executeGitDiff(cwd, staged, filePath);
    },
  },
  {
    name: 'GitCommit',
    description: 'Create a git commit with a message. Optionally stage all changes first.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        addAll: { type: 'boolean', description: 'Stage all changes before committing (default: false)' },
      },
      required: ['message'],
    },
    execute: async (args) => {
      const message = String(args['message'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const addAll = args['addAll'] === true;
      return executeGitCommit(message, cwd, addAll);
    },
  },
  {
    name: 'GitBranch',
    description: 'List git branches. Can show local or all branches including remotes.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        remotes: { type: 'boolean', description: 'Show remote branches too (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const remotes = args['remotes'] === true;
      return executeGitBranch(cwd, remotes);
    },
  },
  {
    name: 'GitCheckout',
    description: 'Switch to a branch or create a new branch.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        create: { type: 'boolean', description: 'Create new branch (default: false)' },
      },
      required: ['branch'],
    },
    execute: async (args) => {
      const branch = String(args['branch'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const create = args['create'] === true;
      return executeGitCheckout(branch, cwd, create);
    },
  },
  {
    name: 'GitLog',
    description: 'Show git commit history.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        maxCount: { type: 'number', description: 'Maximum number of commits (default: 10)' },
        oneline: { type: 'boolean', description: 'Show in one-line format (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const maxCount = args['maxCount'] !== undefined ? Number(args['maxCount']) : 10;
      const oneline = args['oneline'] === true;
      return executeGitLog(cwd, maxCount, oneline);
    },
  },
  {
    name: 'GitPush',
    description: 'Push commits to remote repository. Use with caution on shared branches.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        remote: { type: 'string', description: 'Remote name (default: "origin")' },
        branch: { type: 'string', description: 'Branch name (optional)' },
        force: { type: 'boolean', description: 'Force push (USE WITH EXTREME CAUTION, default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const remote = args['remote'] ? String(args['remote']) : 'origin';
      const branch = args['branch'] ? String(args['branch']) : undefined;
      const force = args['force'] === true;
      return executeGitPush(cwd, remote, branch, force);
    },
  },
  {
    name: 'GitPull',
    description: 'Pull changes from remote repository.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        remote: { type: 'string', description: 'Remote name (default: "origin")' },
        branch: { type: 'string', description: 'Branch name (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const remote = args['remote'] ? String(args['remote']) : 'origin';
      const branch = args['branch'] ? String(args['branch']) : undefined;
      return executeGitPull(cwd, remote, branch);
    },
  },
  {
    name: 'GitClone',
    description: 'Clone a git repository from a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Repository URL' },
        destination: { type: 'string', description: 'Destination directory (optional)' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const destination = args['destination'] ? String(args['destination']) : undefined;
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitClone(url, destination, cwd);
    },
  },
  {
    name: 'GitAdd',
    description: 'Stage files for commit.',
    parameters: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Files to stage' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['files'],
    },
    execute: async (args) => {
      const files = (args['files'] as string[]) ?? [];
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitAdd(files, cwd);
    },
  },
  {
    name: 'GitReset',
    description: 'Unstage files or reset changes. Use hard reset with caution.',
    parameters: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Files to unstage (optional)' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        hard: { type: 'boolean', description: 'Hard reset - DISCARDS CHANGES (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const files = args['files'] ? (args['files'] as string[]) : undefined;
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const hard = args['hard'] === true;
      return executeGitReset(files, cwd, hard);
    },
  },
  {
    name: 'GitStash',
    description: 'Stash uncommitted changes. Can save, pop, list, or apply stashes.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['save', 'pop', 'list', 'apply'], description: 'Stash action (default: save)' },
        message: { type: 'string', description: 'Stash message (for save action)' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const action = (args['action'] as 'save' | 'pop' | 'list' | 'apply') || 'save';
      const message = args['message'] ? String(args['message']) : undefined;
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitStash(action, message, cwd);
    },
  },
  {
    name: 'GitMerge',
    description: 'Merge a branch into the current branch.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch to merge' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        noFf: { type: 'boolean', description: 'Create merge commit even if fast-forward (default: false)' },
      },
      required: ['branch'],
    },
    execute: async (args) => {
      const branch = String(args['branch'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const noFf = args['noFf'] === true;
      return executeGitMerge(branch, cwd, noFf);
    },
  },
  {
    name: 'GitRemote',
    description: 'List remote repositories.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        verbose: { type: 'boolean', description: 'Show URLs (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const verbose = args['verbose'] === true;
      return executeGitRemote(cwd, verbose);
    },
  },
  {
    name: 'GitCurrentBranch',
    description: 'Show the current branch name.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitCurrentBranch(cwd);
    },
  },
  {
    name: 'GitBlame',
    description: 'Show who last modified each line of a file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'File to blame' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitBlame(filePath, cwd);
    },
  },
  {
    name: 'ParseAst',
    description: 'Parse JavaScript/TypeScript code and return AST information.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
        language: { type: 'string', enum: ['javascript', 'typescript'], description: 'Language (default: javascript)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const language = (args['language'] as 'javascript' | 'typescript') || 'javascript';
      return executeParseAst(filePath, language);
    },
  },
  {
    name: 'AnalyzeCode',
    description: 'Analyze code structure and extract symbols (imports, exports, functions, classes, variables).',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
        language: { type: 'string', enum: ['javascript', 'typescript'], description: 'Language (default: javascript)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const language = (args['language'] as 'javascript' | 'typescript') || 'javascript';
      return executeAnalyzeCode(filePath, language);
    },
  },
  {
    name: 'Complexity',
    description: 'Calculate code complexity metrics (cyclomatic complexity, nesting depth, branches).',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      return executeComplexity(filePath);
    },
  },
  {
    name: 'Lint',
    description: 'Run ESLint on a file to find code quality issues. Can auto-fix fixable issues.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
        fix: { type: 'boolean', description: 'Auto-fix fixable issues (default: false)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const fix = args['fix'] === true;
      return executeLint(filePath, fix);
    },
  },
  {
    name: 'FindDeps',
    description: 'Find and list project dependencies from package.json.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Project directory path' },
      },
      required: ['projectDir'],
    },
    execute: async (args) => {
      const projectDir = String(args['projectDir'] ?? '');
      return executeFindDeps(projectDir);
    },
  },
  {
    name: 'CountLines',
    description: 'Count lines of code, comments, and blank lines in a file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the source file' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      return executeCountLines(filePath);
    },
  },
  {
    name: 'HttpRequest',
    description:
      'Send HTTP request with configurable method, headers, and body. Returns response with status, headers, and data.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL' },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          description: 'HTTP method (default: GET)',
        },
        headers: { type: 'object', description: 'Request headers (optional)' },
        body: { type: 'string', description: 'Request body for POST/PUT/PATCH (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const method = (args['method'] as Method) || 'GET';
      const headers = args['headers'] as Record<string, string> | undefined;
      const body = args['body'] ? String(args['body']) : undefined;
      const timeout = args['timeout'] !== undefined ? Number(args['timeout']) : 30000;
      return executeHttpRequest(url, method, headers, body, timeout);
    },
  },
  {
    name: 'DownloadFile',
    description: 'Download file from URL to local path. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Source URL' },
        destPath: { type: 'string', description: 'Destination file path' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)' },
      },
      required: ['url', 'destPath'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const destPath = String(args['destPath'] ?? '');
      const timeout = args['timeout'] !== undefined ? Number(args['timeout']) : 60000;
      return executeDownloadFile(url, destPath, timeout);
    },
  },
  {
    name: 'UploadFile',
    description: 'Upload file to server via multipart/form-data. Can include additional form fields.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL' },
        filePath: { type: 'string', description: 'Local file path to upload' },
        fieldName: { type: 'string', description: 'Form field name for file (default: "file")' },
        additionalFields: { type: 'object', description: 'Additional form fields (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)' },
      },
      required: ['url', 'filePath'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const filePath = String(args['filePath'] ?? '');
      const fieldName = args['fieldName'] ? String(args['fieldName']) : 'file';
      const additionalFields = args['additionalFields'] as Record<string, string> | undefined;
      const timeout = args['timeout'] !== undefined ? Number(args['timeout']) : 60000;
      return executeUploadFile(url, filePath, fieldName, additionalFields, timeout);
    },
  },
  {
    name: 'ApiCall',
    description: 'Call RESTful API with JSON body and parse response. Automatic Content-Type: application/json.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'API endpoint URL' },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          description: 'HTTP method (default: GET)',
        },
        body: { type: 'object', description: 'JSON request body (optional)' },
        headers: { type: 'object', description: 'Additional headers (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const method = (args['method'] as Method) || 'GET';
      const body = args['body'];
      const headers = args['headers'] as Record<string, string> | undefined;
      const timeout = args['timeout'] !== undefined ? Number(args['timeout']) : 30000;
      return executeApiCall(url, method, body, headers, timeout);
    },
  },
  {
    name: 'CheckUrl',
    description: 'Check if URL is accessible. Returns status, response time, content type, and server info.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to check' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 10000)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const timeout = args['timeout'] !== undefined ? Number(args['timeout']) : 10000;
      return executeCheckUrl(url, timeout);
    },
  },
  {
    name: 'ParseUrl',
    description: 'Parse URL and extract components (protocol, host, port, pathname, query parameters, hash).',
    parameters: {
      type: 'object',
      properties: {
        urlString: { type: 'string', description: 'URL string to parse' },
      },
      required: ['urlString'],
    },
    execute: async (args) => {
      const urlString = String(args['urlString'] ?? '');
      return executeParseUrl(urlString);
    },
  },
  {
    name: 'MathSolve',
    description:
      'Solve middle school math problems step by step with Chinese explanations. ' +
      'Covers: linear equations (一元一次方程), quadratic equations (一元二次方程), ' +
      'systems of equations (二元一次方程组), Pythagorean theorem (勾股定理), ' +
      'circle geometry (圆), statistics (统计), and percentages (百分比).',
    parameters: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: 'The math problem to solve' },
        type: {
          type: 'string',
          enum: ['linear', 'quadratic', 'system', 'pythagorean', 'circle', 'stats', 'percent'],
          description: 'Problem type (auto-detected if not specified)',
        },
      },
      required: ['problem'],
    },
    execute: async (args) => {
      const problem = String(args['problem'] ?? '');
      const type = args['type'] ? String(args['type']) : undefined;
      return executeMathSolve(problem, type);
    },
  },
  {
    name: 'MathPlot',
    description:
      'Generate SVG mathematical diagrams. Supports: coordinate plane (坐标系), ' +
      'function graphs (函数图像, e.g. func:x*2+1), triangle (三角形 with labels), ' +
      'bar charts (条形统计图 e.g. bar:A=5,B=8). Outputs SVG files viewable in browser.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Plot kind: coordinate, func:<expr>, triangle, bar:<data>' },
        output: { type: 'string', description: 'Output filename (default: auto-named .svg in project root)' },
      },
      required: ['kind'],
    },
    execute: async (args) => {
      const kind = String(args['kind'] ?? '');
      const output = args['output'] ? String(args['output']) : undefined;
      return executeMathPlot(kind, output);
    },
  },
  {
    name: 'Search',
    description:
      'Search for files by name and/or content in a directory. Returns ranked results: file name matches first, then content matches with line numbers. Faster than running Glob + Grep separately.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (regex supported)' },
        rootDir: { type: 'string', description: 'Root directory to search (default: cwd)' },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 20)' },
        includeGlob: { type: 'string', description: 'File glob filter e.g. "*.ts" (optional)' },
        searchContent: { type: 'boolean', description: 'Search file contents (default: true)' },
        searchNames: { type: 'boolean', description: 'Search file names (default: true)' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive search (default: false)' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '');
      const rootDir = args['rootDir'] ? String(args['rootDir']) : undefined;
      return executeSearch(query, rootDir, {
        maxResults: args['maxResults'] !== undefined ? Number(args['maxResults']) : undefined,
        includeGlob: args['includeGlob'] ? String(args['includeGlob']) : undefined,
        searchContent: args['searchContent'] !== false,
        searchNames: args['searchNames'] !== false,
        caseSensitive: args['caseSensitive'] === true,
      });
    },
  },
  {
    name: 'ImageInfo',
    description: 'Read image file metadata: format, dimensions, file size. Supports PNG, JPEG, GIF, WEBP, BMP, ICO.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the image file' },
      },
      required: ['filePath'],
    },
    execute: async (args) => executeImageInfo(String(args['filePath'] ?? '')),
  },
  {
    name: 'ImageToBase64',
    description: 'Encode an image file to a base64 data URI string. Max 5 MB by default.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the image file' },
        maxBytes: { type: 'number', description: 'Max file size in bytes (default: 5242880 = 5 MB)' },
      },
      required: ['filePath'],
    },
    execute: async (args) =>
      executeImageToBase64(
        String(args['filePath'] ?? ''),
        args['maxBytes'] !== undefined ? Number(args['maxBytes']) : undefined,
      ),
  },
  {
    name: 'ListImages',
    description: 'List all image files in a directory (PNG, JPEG, GIF, WEBP, BMP, ICO, SVG, TIFF).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to scan' },
      },
      required: ['path'],
    },
    execute: async (args) => executeListImages(String(args['path'] ?? '')),
  },
  {
    name: 'MathExplain',
    description:
      'Reference for middle school math concepts with formulas, examples, and common mistakes. ' +
      'Topics: linear equations (一元一次方程), quadratic equations (一元二次方程), ' +
      'Pythagorean theorem (勾股定理), linear functions (一次函数), ' +
      'quadratic functions (二次函数), circles (圆), statistics (统计), probability (概率).',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic name (Chinese or English). Leave empty to list all topics.' },
      },
      required: [],
    },
    execute: async (args) => {
      const topic = args['topic'] ? String(args['topic']) : undefined;
      return executeMathExplain(topic);
    },
  },
];

export function getTool(name: string): ToolDefinition | undefined {
  return (
    tools.find((t) => t.name === name) ?? mcpTools.find((t) => t.name === name) ?? qtTools.find((t) => t.name === name)
  );
}

export function toolSchemas(): Array<{
  name: string;
  description: string;
  input_schema: { type: 'object'; properties?: unknown; required?: string[]; [k: string]: unknown };
}> {
  const allTools = [...tools, ...mcpTools, ...qtTools];
  return allTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as { type: 'object'; properties?: unknown; required?: string[]; [k: string]: unknown },
  }));
}
