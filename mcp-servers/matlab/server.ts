#!/usr/bin/env node
/**
 * MATLAB MCP Server — exposes MATLAB operations as MCP tools.
 *
 * Prerequisites:
 *   - MATLAB must be installed and `matlab` available in PATH
 *   - Or set MATLAB_BIN env var to the full path of matlab executable
 *
 * Usage:
 *   npx tsx mcp-servers/matlab/server.ts
 *
 * Tools provided:
 *   - matlab_exec    — Execute a MATLAB command and return output
 *   - matlab_run     — Run a .m script file
 *   - matlab_readmat — Read variables from a .mat file
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MATLAB_BIN = process.env['MATLAB_BIN'] || 'matlab';

const server = new Server({ name: 'codeyang-matlab', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler({ method: 'tools/list' }, async () => ({
  tools: [
    {
      name: 'matlab_exec',
      description:
        'Execute a MATLAB command and return the output. Use this to run calculations, plots, simulations, or any MATLAB code.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'MATLAB command(s) to execute. Multiple commands can be separated by semicolons.',
          },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 60, max: 300)' },
          nodisplay: {
            type: 'boolean',
            description: 'Use -nodisplay flag (default: true). Set to false for GUI operations.',
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
      description: 'Read variables from a .mat file and return their names, sizes, and types.',
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
  const display = '-nodisplay -nosplash';
  const cmd = `"${MATLAB_BIN}" ${display} ${flag} -batch ${JSON.stringify(script)}`;
  try {
    const result = execSync(cmd, {
      timeout: timeout * 1000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, TERM: 'dumb' },
    });
    return result.trim();
  } catch (err: any) {
    if (err.stderr) return `stderr:\n${err.stderr.trim()}`;
    if (err.stdout) return `stdout:\n${err.stdout.trim()}`;
    return `Error: ${err.message}`;
  }
}

server.setRequestHandler({ method: 'tools/call' }, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'matlab_exec': {
        const command = String(args['command'] ?? '');
        const timeout = Math.min(Number(args['timeout'] ?? 60), 300);
        const output = runMatlab(`disp('=== MATLAB OUTPUT ===');${command};disp('=== END ===')`, timeout);
        // Extract content between markers
        const match = output.match(/=== MATLAB OUTPUT ===\n?([\s\S]*?)\n?=== END ===/);
        const result = match ? match[1].trim() : output;
        return { content: [{ type: 'text', text: result || '(no output)' }] };
      }

      case 'matlab_run': {
        const filePath = resolve(String(args['filePath'] ?? ''));
        if (!existsSync(filePath)) {
          return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
        }
        const timeout = Math.min(Number(args['timeout'] ?? 120), 600);
        const output = runMatlab(`run('${filePath.replace(/\\/g, '/')}')`, timeout);
        return { content: [{ type: 'text', text: output || '(no output)' }] };
      }

      case 'matlab_readmat': {
        const filePath = resolve(String(args['filePath'] ?? ''));
        if (!existsSync(filePath)) {
          return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
        }
        const script = `
          disp('=== MATLAB VARIABLES ===');
          d = whos('-file', '${filePath.replace(/\\/g, '/')}');
          for i = 1:length(d)
            fprintf('%s | %s | %s\\n', d(i).name, d(i).class, mat2str(d(i).size));
          end
        `;
        const output = runMatlab(script, 30);
        const match = output.match(/=== MATLAB VARIABLES ===\n?([\s\S]*)/);
        if (!match) return { content: [{ type: 'text', text: output }] };

        const lines = match[1].trim().split('\n').filter(Boolean);
        const result = ['Variables in ' + filePath + ':', 'Name | Type | Size', '--- | --- | ---', ...lines];
        return { content: [{ type: 'text', text: result.join('\n') }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MATLAB MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
