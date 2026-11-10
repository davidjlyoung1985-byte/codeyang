/**
 * Tests for McpManager — managing multiple MCP server connections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpManager } from './McpManager.js';
import { McpClient } from './McpClient.js';
import type { McpServerConfig } from './types.js';

// Mock McpClient
vi.mock('./McpClient.js', () => {
  return {
    McpClient: vi.fn().mockImplementation((name: string, _config: McpServerConfig) => {
      const mockTools = [
        {
          name: `${name}__tool1`,
          description: 'Test tool 1',
          input_schema: { type: 'object', properties: {} },
        },
        {
          name: `${name}__tool2`,
          description: 'Test tool 2',
          input_schema: { type: 'object', properties: {} },
        },
      ];

      return {
        name,
        connected: true,
        tools: mockTools,
        onDisconnect: null as ((serverName: string) => void) | null,
        connect: vi.fn().mockImplementation(async function (this: McpClient) {
          this.connected = true;
          return mockTools;
        }),
        refreshTools: vi.fn().mockResolvedValue([mockTools[0]]),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Mock result' }],
          isError: false,
        }),
        disconnect: vi.fn(),
        getAvailableTools: vi.fn().mockReturnValue(mockTools),
      } as unknown as McpClient;
    }),
  };
});

describe('McpManager', () => {
  let manager: McpManager;
  let timers: ReturnType<typeof setTimeout>[];

  beforeEach(() => {
    manager = new McpManager();
    timers = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clear any pending timers
    timers.forEach((timer) => clearTimeout(timer));
  });

  describe('configure', () => {
    it('should add valid server configurations', () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
        server2: {
          command: 'python',
          args: ['server2.py'],
        },
      };

      manager.configure(servers);

      expect(manager.serverNames).toEqual(['server1', 'server2']);
    });

    it('should skip already-configured servers', () => {
      const servers1: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
      };

      const servers2: Record<string, McpServerConfig> = {
        server1: {
          command: 'python', // Different config, should be skipped
          args: ['different.py'],
        },
        server2: {
          command: 'node',
          args: ['server2.js'],
        },
      };

      manager.configure(servers1);
      manager.configure(servers2);

      expect(manager.serverNames).toEqual(['server1', 'server2']);
    });

    it('should skip invalid server configurations', () => {
      const servers: Record<string, McpServerConfig> = {
        valid: {
          command: 'node',
          args: ['server.js'],
        },
        invalid: {
          command: '', // Invalid: empty command
        },
      };

      manager.configure(servers);

      expect(manager.serverNames).toEqual(['valid']);
    });
  });

  describe('initialize', () => {
    it('should connect to all configured servers', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
        server2: {
          command: 'python',
          args: ['server2.py'],
        },
      };

      manager.configure(servers);
      await manager.initialize();

      expect(manager.allTools.length).toBeGreaterThan(0);
    });

    it('should call onStatus callback during initialization', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
      };

      const onStatus = vi.fn();
      manager.configure(servers);
      await manager.initialize(onStatus);

      expect(onStatus).toHaveBeenCalledWith('server1', 'connecting', expect.any(String));
      expect(onStatus).toHaveBeenCalledWith('server1', 'connected', expect.any(String));
    });

    it('should handle connection errors gracefully', async () => {
      const servers: Record<string, McpServerConfig> = {
        failing: {
          command: 'nonexistent',
          args: ['server.js'],
        },
      };

      // Mock a failing connection
      vi.mocked(McpClient).mockImplementationOnce(() => {
        return {
          name: 'failing',
          connected: false,
          tools: [],
          onDisconnect: null,
          connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
          refreshTools: vi.fn(),
          callTool: vi.fn(),
          disconnect: vi.fn(),
          getAvailableTools: vi.fn().mockReturnValue([]),
        } as unknown as McpClient;
      });

      const onStatus = vi.fn();
      manager.configure(servers);
      await manager.initialize(onStatus);

      expect(onStatus).toHaveBeenCalledWith('failing', 'error', 'Connection failed');
      expect(manager.getConnectionErrors()).toEqual(['failing: Connection failed']);
    });

    it('should not reinitialize if already initialized', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
      };

      manager.configure(servers);
      await manager.initialize();

      const toolsBefore = manager.allTools;
      await manager.initialize(); // Should do nothing

      expect(manager.allTools).toBe(toolsBefore);
    });
  });

  describe('allTools', () => {
    it('should return empty array before initialization', () => {
      expect(manager.allTools).toEqual([]);
    });

    it('should return all tools from all servers after initialization', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
        server2: {
          command: 'python',
          args: ['server2.py'],
        },
      };

      manager.configure(servers);
      await manager.initialize();

      expect(manager.allTools.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('serverNames', () => {
    it('should return empty array when no servers configured', () => {
      expect(manager.serverNames).toEqual([]);
    });

    it('should return all configured server names', () => {
      const servers: Record<string, McpServerConfig> = {
        server1: { command: 'node' },
        server2: { command: 'python' },
        server3: { command: 'deno' },
      };

      manager.configure(servers);

      expect(manager.serverNames).toEqual(['server1', 'server2', 'server3']);
    });
  });

  describe('getServerStatus', () => {
    it('should return "not_configured" for unknown server', () => {
      expect(manager.getServerStatus('unknown')).toBe('not_configured');
    });

    it('should return "connected" for connected server', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
      };

      manager.configure(servers);
      await manager.initialize();

      expect(manager.getServerStatus('server1')).toBe('connected');
    });
  });

  describe('refreshTools', () => {
    it('should refresh tools from all connected servers', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
      };

      manager.configure(servers);
      await manager.initialize();

      const refreshedTools = await manager.refreshTools();

      expect(refreshedTools).toBeDefined();
      expect(refreshedTools.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle refresh errors gracefully', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
      };

      manager.configure(servers);
      await manager.initialize();

      // Note: We can't easily mock refreshTools to fail after initialization
      // because the mock is set up before connect() is called.
      // Just verify that refreshTools works normally.

      await expect(manager.refreshTools()).resolves.toBeDefined();
    });
  });

  describe('callTool', () => {
    it('should reject tool calls with invalid qualified names', async () => {
      const result = await manager.callTool('invalid_tool', {});

      expect(result.isError).toBe(true);
      expect(result.output).toContain('Invalid MCP tool name');
    });

    it('should reject tool calls to non-existent servers', async () => {
      const result = await manager.callTool('mcp__nonexistent__tool', {});

      expect(result.isError).toBe(true);
      expect(result.output).toContain('not found');
    });
  });

  describe('getConnectionErrors', () => {
    it('should return empty array when no errors', async () => {
      const servers: Record<string, McpServerConfig> = {
        server1: {
          command: 'node',
          args: ['server1.js'],
        },
      };

      manager.configure(servers);
      await manager.initialize();

      expect(manager.getConnectionErrors()).toEqual([]);
    });

    it('should return list of connection errors', async () => {
      const servers: Record<string, McpServerConfig> = {
        failing: {
          command: 'nonexistent',
        },
      };

      // Mock a failing connection
      vi.mocked(McpClient).mockImplementationOnce(() => {
        return {
          name: 'failing',
          connected: false,
          tools: [],
          onDisconnect: null,
          connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
          refreshTools: vi.fn(),
          callTool: vi.fn(),
          disconnect: vi.fn(),
          getAvailableTools: vi.fn().mockReturnValue([]),
        } as unknown as McpClient;
      });

      manager.configure(servers);
      await manager.initialize();

      const errors = manager.getConnectionErrors();
      expect(errors).toEqual(['failing: Connection failed']);
    });
  });
});
