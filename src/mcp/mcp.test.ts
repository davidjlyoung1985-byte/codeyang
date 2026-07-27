/**
 * Tests for MCP module — types, config validation, and tool name handling.
 */
import { describe, it, expect } from 'vitest';
import {
  MCP_TOOL_PREFIX,
  MCP_TOOL_SEPARATOR,
  MCP_QUALIFIED_PREFIX,
  validateMcpConfig,
  type McpServerConfig,
} from './types.js';

describe('MCP Types', () => {
  describe('constants', () => {
    it('should have correct prefix and separator', () => {
      expect(MCP_TOOL_PREFIX).toBe('mcp');
      expect(MCP_TOOL_SEPARATOR).toBe('__');
      expect(MCP_QUALIFIED_PREFIX).toBe('mcp__');
    });
  });

  describe('validateMcpConfig', () => {
    it('should accept valid stdio config', () => {
      const config: McpServerConfig = {
        command: 'node',
        args: ['server.js'],
      };
      const errors = validateMcpConfig(config);
      expect(errors).toEqual([]);
    });

    it('should accept valid SSE config', () => {
      const config: McpServerConfig = {
        transport: 'sse',
        url: 'http://localhost:3000/sse',
      };
      const errors = validateMcpConfig(config);
      expect(errors).toEqual([]);
    });

    it('should accept valid streamable-http config', () => {
      const config: McpServerConfig = {
        transport: 'streamable-http',
        url: 'http://localhost:3000/mcp',
      };
      const errors = validateMcpConfig(config);
      expect(errors).toEqual([]);
    });

    it('should reject invalid transport type', () => {
      const config: McpServerConfig = {
        transport: 'invalid' as never,
        url: 'http://localhost:3000',
      };
      const errors = validateMcpConfig(config);
      expect(errors.some((e) => e.includes('transport'))).toBe(true);
    });

    it('should reject stdio config without command', () => {
      const config: McpServerConfig = {
        command: '',
      };
      const errors = validateMcpConfig(config);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject stdio config with url', () => {
      const config: McpServerConfig = {
        command: 'node',
        url: 'http://localhost:3000',
      };
      const errors = validateMcpConfig(config);
      expect(errors.some((e) => e.includes('url is not used'))).toBe(true);
    });

    it('should reject non-stdio config without url', () => {
      const config: McpServerConfig = {
        transport: 'sse',
        command: 'node',
      };
      const errors = validateMcpConfig(config);
      expect(errors.some((e) => e.includes('command is not used'))).toBe(true);
      expect(errors.some((e) => e.includes('url'))).toBe(true);
    });

    it('should validate optional fields', () => {
      const config: McpServerConfig = {
        command: 'node',
        args: 'invalid' as never,
        env: [] as never,
        cwd: 123 as never,
      };
      const errors = validateMcpConfig(config);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
