import type { ToolDefinition } from '../../types.js';
import { executePowerShell } from '../PowerShellTool.js';
import { executeToolSearch } from '../ToolSearchTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'PowerShell',
    description:
      'Execute a PowerShell command on Windows. Use for Windows-specific operations ' +
      'like registry edits, service management, or when Bash is unavailable. ' +
      'Includes security checks for dangerous operations.\n\n' +
      '⚠️ IMPORTANT - Pipeline Exit Code Caveat:\n' +
      'Pipelines in PowerShell reset the exit code to the last command in the pipeline.\n' +
      'Example: `node --test | Select-Object -Last 25`\n' +
      '  - $LASTEXITCODE = 1 (node --test failed)\n' +
      '  - But process exit code = 0 (Select-Object succeeded)\n' +
      '  - Tool reports success even though tests failed!\n\n' +
      'Solution: Avoid wrapping commands in pipelines if you need to check exit codes.\n' +
      '  ❌ BAD:  node --test | Select-Object -Last 10\n' +
      '  ✅ GOOD: node --test\n' +
      '  ✅ GOOD: node --test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'PowerShell command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout_secs: { type: 'number', description: 'Timeout in seconds (default: 30)' },
      },
      required: ['command'],
    },
    execute: async (args) => {
      const command = String(args['command'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const timeoutSecs = args['timeout_secs'] !== undefined ? Number(args['timeout_secs']) : 30;
      return executePowerShell(command, cwd, timeoutSecs);
    },
  },
  {
    name: 'ToolSearch',
    description:
      'Search available tools by name or description. Use when you need to find ' +
      'the right tool for a task but are not sure what is available. ' +
      'Returns tool names, descriptions, and parameter lists.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (matches tool name and description)' },
      },
      required: ['query'],
    },
    execute: async (args) => executeToolSearch(String(args['query'] ?? '')),
  },
];
