/**
 * Tests for McpClient — command validation, connection state handling,
 * tool invocation and shutdown. The underlying MCP SDK transport is mocked
 * so no real server/process is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    private tools = [
      {
        name: 'add',
        description: 'Add two numbers',
        inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
      },
      {
        name: 'nodate',
        inputSchema: { type: 'object' },
      },
    ];
    connect = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    listTools = vi.fn().mockImplementation(() => Promise.resolve({ tools: this.tools }));
    callTool = vi
      .fn()
      .mockImplementation(({ name }: { name: string }) =>
        name === 'fail'
          ? Promise.resolve({ content: [{ type: 'text', text: 'error happened' }], isError: true })
          : Promise.resolve({ content: [{ type: 'text', text: '42' }] }),
      );
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    static instances: InstanceType<typeof StdioClientTransport>[] = [];
    onclose: (() => void) | undefined;
    onerror: (() => void) | undefined;
    constructor() {
      (this.constructor as typeof StdioClientTransport & { instances: unknown[] }).instances.push(this);
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class {
    onclose: (() => void) | undefined;
    onerror: (() => void) | undefined;
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    onclose: (() => void) | undefined;
    onerror: (() => void) | undefined;
  },
}));

import { McpClient } from './McpClient.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('McpClient', () => {
  let originalEnv: NodeJS.ProcessEnv | undefined;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.CODEYANG_MCP_ALLOW_UNSAFE;
  });

  afterEach(() => {
    process.env = originalEnv as NodeJS.ProcessEnv;
  });

  describe('connect', () => {
    it('connects via stdio with a whitelisted command', async () => {
      const client = new McpClient('server1', { command: 'node', args: ['mcp-server.js'] });
      const tools = await client.connect();
      expect(client.connected).toBe(true);
      expect(tools.length).toBe(2);
      expect(tools[0]?.qualifiedName).toBe('mcp__server1__add');
      expect(tools[0]?.description).toBe('Add two numbers');
      // Tool without description gets a fallback
      expect(tools[1]?.description).toContain('nodate');
    });

    it('returns existing tools without reconnecting when already connected', async () => {
      const client = new McpClient('server1', { command: 'node' });
      await client.connect();
      const again = await client.connect();
      expect(again.length).toBe(2);
    });

    it('throws for commands not in the whitelist', async () => {
      const client = new McpClient('server1', { command: 'python', args: ['server.py'] });
      await expect(client.connect()).rejects.toThrow(/not in the allowed list/);
      expect(client.connected).toBe(false);
    });

    it('throws for unknown transport types', async () => {
      const client = new McpClient('server1', {
        transport: 'weird' as never,
        command: 'node',
      });
      await expect(client.connect()).rejects.toThrow(/Unknown transport type/);
    });

    it('connects via SSE transport', async () => {
      const client = new McpClient('server1', { transport: 'sse', url: 'http://localhost:3000/sse' });
      const tools = await client.connect();
      expect(client.connected).toBe(true);
      expect(tools.length).toBe(2);
    });

    it('connects via streamable-http transport', async () => {
      const client = new McpClient('server1', {
        transport: 'streamable-http',
        url: 'http://localhost:3000/mcp',
      });
      const tools = await client.connect();
      expect(client.connected).toBe(true);
      expect(tools.length).toBe(2);
    });
  });

  describe('tool discovery', () => {
    it('refreshTools returns [] when not connected', async () => {
      const client = new McpClient('server1', { command: 'node' });
      const tools = await client.refreshTools();
      expect(tools).toEqual([]);
    });

    it('refreshTools re-discovers tools when connected', async () => {
      const client = new McpClient('server1', { command: 'node' });
      await client.connect();
      const tools = await client.refreshTools();
      expect(tools.length).toBe(2);
    });
  });

  describe('callTool', () => {
    it('returns an error when not connected', async () => {
      const client = new McpClient('server1', { command: 'node' });
      const result = await client.callTool('add', { a: 1 });
      expect(result.isError).toBe(true);
      expect(result.output).toContain('not connected');
    });

    it('returns text content when connected', async () => {
      const client = new McpClient('server1', { command: 'node' });
      await client.connect();
      const result = await client.callTool('add', { a: 1, b: 2 });
      expect(result.output).toBe('42');
      expect(result.isError).toBe(false);
    });

    it('propagates isError from the server', async () => {
      const client = new McpClient('server1', { command: 'node' });
      await client.connect();
      const result = await client.callTool('fail', {});
      expect(result.isError).toBe(true);
    });
  });

  describe('disconnect and disconnect handling', () => {
    it('disconnect clears connection state and tools', async () => {
      const client = new McpClient('server1', { command: 'node' });
      await client.connect();
      await client.disconnect();
      expect(client.connected).toBe(false);
      expect(client.tools).toEqual([]);
    });

    it('disconnect is safe when never connected', async () => {
      const client = new McpClient('server1', { command: 'node' });
      await expect(client.disconnect()).resolves.toBeUndefined();
    });

    it('invokes onDisconnect when the transport closes unexpectedly', async () => {
      const client = new McpClient('server1', { command: 'node' });
      const onDisconnect = vi.fn();
      client.onDisconnect = onDisconnect;

      await client.connect();

      // Grab the transport close handler and fire it
      const TransportClass = StdioClientTransport as unknown as {
        instances: Array<{ onclose?: () => void }>;
      };
      const mockTransport = TransportClass.instances[TransportClass.instances.length - 1];
      expect(mockTransport).toBeDefined();
      mockTransport.onclose?.();

      expect(client.connected).toBe(false);
      expect(client.tools).toEqual([]);
      expect(onDisconnect).toHaveBeenCalledWith('server1');
    });
  });
});
