import { describe, it, expect, beforeEach } from 'vitest';
import { McpManager, type McpToolDef } from '../mcp/McpManager.js';
import { setMcpManager, refreshMcpTools, getTool, toolSchemas } from './registry.js';

// ──────────────────────────────────────────────
// McpManager tests
// ──────────────────────────────────────────────

describe('McpManager', () => {
  let mgr: McpManager;

  beforeEach(() => {
    mgr = new McpManager();
  });

  describe('configure', () => {
    it('stores server configs without connecting', () => {
      mgr.configure({
        'test-server': { command: 'node', args: ['test.js'] },
      });
      expect(mgr.hasServers).toBe(true);
      expect(mgr.serverNames).toContain('test-server');
    });

    it('accepts multiple servers', () => {
      mgr.configure({
        srv1: { command: 'node', args: ['srv1.js'] },
        srv2: { command: 'python', args: ['srv2.py'] },
      });
      expect(mgr.serverNames).toHaveLength(2);
      expect(mgr.serverNames).toContain('srv1');
      expect(mgr.serverNames).toContain('srv2');
    });

    it('throws no error on empty config', () => {
      mgr.configure({});
      expect(mgr.hasServers).toBe(false);
      expect(mgr.serverNames).toHaveLength(0);
    });
  });

  describe('callTool', () => {
    it('returns error for invalid qualified name', async () => {
      const result = await mgr.callTool('not-a-mcp-tool', {});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('Invalid MCP tool name');
    });

    it('returns error for non-existent server', async () => {
      const result = await mgr.callTool('mcp__missing-server__someTool', {});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('not found');
    });

    it('parses qualified name correctly for unconnected server', async () => {
      mgr.configure({ demo: { command: 'node', args: ['demo.js'] } });
      const result = await mgr.callTool('mcp__demo__search', { query: 'test' });
      // Server is configured but never initialized (not in clients map), so "not found"
      expect(result.isError).toBe(true);
    });
  });

  describe('allTools', () => {
    it('returns empty array when no servers connected', () => {
      expect(mgr.allTools).toHaveLength(0);
    });

    it('returns empty array when only configured but not initialized', () => {
      mgr.configure({ srv: { command: 'node', args: ['srv.js'] } });
      expect(mgr.allTools).toHaveLength(0);
    });
  });

  describe('hasServers', () => {
    it('returns false with no config', () => {
      expect(mgr.hasServers).toBe(false);
    });

    it('returns true after configure with servers', () => {
      mgr.configure({ srv: { command: 'node', args: ['srv.js'] } });
      expect(mgr.hasServers).toBe(true);
    });
  });
});

// ──────────────────────────────────────────────
// Registry MCP integration
// ──────────────────────────────────────────────

describe('registry MCP integration', () => {
  // Create a mock McpManager that has pre-configured tools
  class MockMcpManager extends McpManager {
    override get allTools(): McpToolDef[] {
      return [
        {
          serverName: 'mock-srv',
          qualifiedName: 'mcp__mock-srv__hello',
          name: 'hello',
          description: 'Say hello',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
        {
          serverName: 'mock-srv',
          qualifiedName: 'mcp__mock-srv__add',
          name: 'add',
          description: 'Add two numbers',
          inputSchema: {
            type: 'object',
            properties: { a: { type: 'number' }, b: { type: 'number' } },
            required: ['a', 'b'],
          },
        },
      ];
    }

    override async refreshTools(): Promise<McpToolDef[]> {
      return this.allTools;
    }

    override async callTool(
      qualifiedName: string,
      args: Record<string, unknown>,
    ): Promise<{ output: string; isError: boolean }> {
      if (qualifiedName === 'mcp__mock-srv__hello') {
        return { output: `Hello, ${args['name']}!`, isError: false };
      }
      if (qualifiedName === 'mcp__mock-srv__add') {
        return { output: String(Number(args['a']) + Number(args['b'])), isError: false };
      }
      return { output: 'Unknown tool', isError: true };
    }
  }

  beforeEach(async () => {
    setMcpManager(null);
    await refreshMcpTools();
  });

  it('has only built-in tools when no MCP manager', () => {
    const schemas = toolSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    // Verify no MCP-prefixed tools
    const mcpNames = schemas.map((s) => s.name).filter((n) => n.startsWith('mcp__'));
    expect(mcpNames).toHaveLength(0);
  });

  it('includes MCP tools after setting manager', async () => {
    const mock = new MockMcpManager();
    setMcpManager(mock as unknown as McpManager);
    await refreshMcpTools();

    const schemas = toolSchemas();
    const mcpNames = schemas.map((s) => s.name).filter((n) => n.startsWith('mcp__'));

    expect(mcpNames).toHaveLength(2);
    expect(mcpNames).toContain('mcp__mock-srv__hello');
    expect(mcpNames).toContain('mcp__mock-srv__add');
  });

  it('getTool finds MCP tool after registration', async () => {
    const mock = new MockMcpManager();
    setMcpManager(mock as unknown as McpManager);
    await refreshMcpTools();

    const tool = getTool('mcp__mock-srv__hello');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('mcp__mock-srv__hello');
    expect(tool!.description).toContain('[MCP:mock-srv]');
    expect(tool!.description).toContain('Say hello');
  });

  it('MCP tool execute delegates to manager', async () => {
    const mock = new MockMcpManager();
    setMcpManager(mock as unknown as McpManager);
    await refreshMcpTools();

    const tool = getTool('mcp__mock-srv__hello');
    expect(tool).toBeDefined();

    const result = await tool!.execute({ name: 'World' });
    expect(result).toBe('Hello, World!');
  });

  it('MCP tool execute reports errors', async () => {
    const mock = new MockMcpManager();
    setMcpManager(mock as unknown as McpManager);
    await refreshMcpTools();

    const tool = getTool('mcp__mock-srv__add');
    expect(tool).toBeDefined();

    const result = await tool!.execute({ a: 3, b: 4 });
    expect(result).toBe('7');
  });

  it('clears MCP tools when manager set to null', async () => {
    const mock = new MockMcpManager();
    setMcpManager(mock as unknown as McpManager);
    await refreshMcpTools();

    expect(
      toolSchemas()
        .map((s) => s.name)
        .filter((n) => n.startsWith('mcp__')),
    ).toHaveLength(2);

    setMcpManager(null);
    await refreshMcpTools();

    expect(
      toolSchemas()
        .map((s) => s.name)
        .filter((n) => n.startsWith('mcp__')),
    ).toHaveLength(0);
  });

  it('getTool falls back to built-in tools', () => {
    const bash = getTool('Bash');
    expect(bash).toBeDefined();
    expect(bash!.name).toBe('Bash');
  });
});
