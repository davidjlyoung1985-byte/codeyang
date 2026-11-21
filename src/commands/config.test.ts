/**
 * Configuration commands tests
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cmdModel, cmdConfig, cmdReload, cmdMcp } from './config.js';
import type { CommandContext } from './types.js';
import * as agentConfig from '../agent/config.js';

describe('Configuration Commands', () => {
  let mockCtx: CommandContext;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCtx = {
      ui: {
        promptUser: vi.fn(),
      },
      agent: {} as any,
    };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cmdModel', () => {
    it('should display current model when no argument provided', async () => {
      vi.spyOn(agentConfig, 'config', 'get').mockReturnValue({ model: 'claude-3-5-sonnet' } as any);

      const result = await cmdModel('/model', mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('claude-3-5-sonnet'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should set and save new model', async () => {
      const saveModelSpy = vi.spyOn(agentConfig, 'saveModel').mockResolvedValue();
      const mockConfig = { model: 'old-model' };
      vi.spyOn(agentConfig, 'config', 'get').mockReturnValue(mockConfig as any);

      const result = await cmdModel('/model claude-opus-4', mockCtx);

      expect(mockConfig.model).toBe('claude-opus-4');
      expect(saveModelSpy).toHaveBeenCalledWith('claude-opus-4');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('claude-opus-4'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should handle model name with spaces', async () => {
      const saveModelSpy = vi.spyOn(agentConfig, 'saveModel').mockResolvedValue();
      const mockConfig = { model: 'old' };
      vi.spyOn(agentConfig, 'config', 'get').mockReturnValue(mockConfig as any);

      await cmdModel('/model  gpt-4  ', mockCtx);

      expect(mockConfig.model).toBe('gpt-4');
      expect(saveModelSpy).toHaveBeenCalledWith('gpt-4');
    });
  });

  describe('cmdConfig', () => {
    it('should display all configuration settings', () => {
      const mockConfig = {
        model: 'claude-3-5-sonnet',
        baseURL: 'https://api.anthropic.com',
        maxTokens: 100000,
        provider: 'anthropic',
        apiKey: 'sk-ant-test123',
      };
      vi.spyOn(agentConfig, 'config', 'get').mockReturnValue(mockConfig as any);

      const result = cmdConfig(mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('claude-3-5-sonnet'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('https://api.anthropic.com'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('100,000'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('anthropic'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('********'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should hide API key', () => {
      const mockConfig = {
        model: 'test',
        baseURL: 'test',
        maxTokens: 1000,
        provider: 'test',
        apiKey: 'secret-key-12345',
      };
      vi.spyOn(agentConfig, 'config', 'get').mockReturnValue(mockConfig as any);

      cmdConfig(mockCtx);

      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).not.toContain('secret-key-12345');
      expect(calls).toContain('********');
    });

    it('should show (not set) when API key is missing', () => {
      const mockConfig = {
        model: 'test',
        baseURL: 'test',
        maxTokens: 1000,
        provider: 'test',
        apiKey: '',
      };
      vi.spyOn(agentConfig, 'config', 'get').mockReturnValue(mockConfig as any);

      cmdConfig(mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(not set)'));
    });
  });

  describe('cmdReload', () => {
    it('should reload configuration from disk', async () => {
      const reloadConfigSpy = vi.spyOn(agentConfig, 'reloadConfig').mockResolvedValue();

      const result = await cmdReload(mockCtx);

      expect(reloadConfigSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('reloaded'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should handle reload errors gracefully', async () => {
      const reloadConfigSpy = vi
        .spyOn(agentConfig, 'reloadConfig')
        .mockRejectedValue(new Error('Config file not found'));

      await expect(cmdReload(mockCtx)).rejects.toThrow('Config file not found');
      expect(reloadConfigSpy).toHaveBeenCalled();
    });
  });

  describe('cmdMcp', () => {
    it('should display message when no MCP servers configured', () => {
      vi.spyOn(agentConfig, 'getMcpServers').mockReturnValue({});

      const result = cmdMcp(mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No MCP servers'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should list all configured MCP servers', () => {
      const mockServers = {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      };
      vi.spyOn(agentConfig, 'getMcpServers').mockReturnValue(mockServers as any);

      const result = cmdMcp(mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('filesystem'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('github'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('@modelcontextprotocol/server-filesystem'));
      expect(mockCtx.ui.promptUser).toHaveBeenCalled();
      expect(result.handled).toBe(true);
    });

    it('should handle servers without args', () => {
      const mockServers = {
        simple: {
          command: 'mcp-server',
          args: undefined,
        },
      };
      vi.spyOn(agentConfig, 'getMcpServers').mockReturnValue(mockServers as any);

      const result = cmdMcp(mockCtx);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('simple'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('mcp-server'));
      expect(result.handled).toBe(true);
    });
  });
});
