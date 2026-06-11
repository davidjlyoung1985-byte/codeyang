#!/usr/bin/env node
/**
 * MATLAB MCP Server — exposes MATLAB operations as MCP tools.
 *
 * Prerequisites:
 *   - MATLAB must be installed and `matlab` available in PATH
 *   - Or set MATLAB_BIN env var (currently: F:\Program Files\MATLAB\R2025b\bin\matlab.exe)
 *
 * Usage:
 *   npx tsx mcp-servers/matlab/server.ts
 *
 * Tools:
 *   - matlab_exec    — Execute MATLAB commands
 *   - matlab_run     — Run .m script files
 *   - matlab_readmat — Read .mat file variables
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MATLAB_BIN = process.env['MATLAB_BIN'] || 'matlab';

const server = new Server({ name: 'codeyang-matlab', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'matlab_exec',
      description:
        'Execute a MATLAB command and return the output. ' +
        'Use this for calculations, plots, simulations, or any MATLAB code.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'MATLAB command(s) to execute. Multiple commands separated by semicolons.',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in seconds (default: 60, max: 300)',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'matlab_run',
      description: 'Run a MATLAB .m script file and return its output.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the .m script file' },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 120, max: 600)' },
        },
        required: ['filePath'],
      },
    },
    {
      name: 'matlab_readmat',
      description: 'Read variables from a .mat file: names, types, and sizes.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the .mat file' },
        },
        required: ['filePath'],
      },
    },
  ],
}));

function runMatlab(script: string, timeout: number): string {
  const flag = process.platform === 'win32' ? '-wait' : '';
  const cmd = `"${MATLAB_BIN}" -nodisplay -nosplash ${flag} -batch ${JSON.stringify(script)}`;
  try {
    const result = execSync(cmd, {
      timeout: timeout * 1000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    if (e.stderr) return `stderr:\n${e.stderr.trim()}`;
    if (e.stdout) return `stdout:\n${e.stdout.trim()}`;
    return `Error: ${e.message}`;
  }
}

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'matlab_exec': {
        const command = String(args?.command ?? '');
        const timeout = Math.min(Number(args?.timeout ?? 60), 300);
        const output = runMatlab(`disp('===MATLAB_OUTPUT===');${command};disp('===END===')`, timeout);
        const match = output.match(/===MATLAB_OUTPUT===\n?([\s\S]*?)\n?===END===/);
        return { content: [{ type: 'text', text: (match?.[1] ?? output).trim() || '(no output)' }] };
      }

      case 'matlab_run': {
        const filePath = resolve(String(args?.filePath ?? ''));
        if (!existsSync(filePath)) {
          return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
        }
        const timeout = Math.min(Number(args?.timeout ?? 120), 600);
        const output = runMatlab(`run('${filePath.replace(/\\/g, '/')}')`, timeout);
        return { content: [{ type: 'text', text: output || '(no output)' }] };
      }

      case 'matlab_readmat': {
        const filePath = resolve(String(args?.filePath ?? ''));
        if (!existsSync(filePath)) {
          return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
        }
        const script = [
          "d = whos('-file', '" + filePath.replace(/\\/g, '/') + "');",
          "fprintf('Name | Class | Size\\n');",
          'for i = 1:length(d)',
          "  fprintf('%s | %s | %s\\n', d(i).name, d(i).class, mat2str(d(i).size));",
          'end',
        ].join('\n');
        const output = runMatlab(script, 30);
        return { content: [{ type: 'text', text: output || '(empty .mat file)' }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
