import { describe, it, expect, beforeEach } from 'vitest';
import {
  setToolContext,
  getCurrentContext,
  getTool,
  getAllTools,
  setPlanMode,
  isPlanMode,
  fuzzyFindToolNames,
  toolSchemas,
} from './registry.js';
import type { ToolContext } from '../types.js';

describe('registry', () => {
  const mockContext: ToolContext = {
    anthropicClient: null,
    llmClient: null,
    model: 'claude-opus-5',
    maxTokens: 8192,
    cwd: '/test/dir',
  };

  beforeEach(() => {
    // Reset context before each test
    setToolContext(mockContext);
    setPlanMode(false);
  });

  describe('setToolContext / getCurrentContext', () => {
    it('stores and retrieves context', () => {
      setToolContext(mockContext);
      const ctx = getCurrentContext();

      expect(ctx).toBeDefined();
      expect(ctx?.model).toBe('claude-opus-5');
      expect(ctx?.cwd).toBe('/test/dir');
    });

    it('updates context when called multiple times', () => {
      setToolContext(mockContext);
      const newContext = { ...mockContext, model: 'claude-sonnet-5' };
      setToolContext(newContext);

      const ctx = getCurrentContext();
      expect(ctx?.model).toBe('claude-sonnet-5');
    });

    it('handles null context', () => {
      setToolContext(null);
      const ctx = getCurrentContext();

      expect(ctx).toBeNull();
    });
  });

  describe('getTool', () => {
    it('returns undefined for non-existent tool', () => {
      const tool = getTool('nonexistent_tool_xyz_123');
      expect(tool).toBeUndefined();
    });

    it('returns builtin tools', () => {
      const readTool = getTool('Read');
      expect(readTool).toBeDefined();
      expect(readTool?.name).toBe('Read');
    });

    it('returns Write tool', () => {
      const writeTool = getTool('Write');
      expect(writeTool).toBeDefined();
      expect(writeTool?.name).toBe('Write');
    });

    it('returns Edit tool', () => {
      const editTool = getTool('Edit');
      expect(editTool).toBeDefined();
    });

    it('returns Bash tool', () => {
      const bashTool = getTool('Bash');
      expect(bashTool).toBeDefined();
    });
  });

  describe('getAllTools', () => {
    it('returns array of all tools', () => {
      const tools = getAllTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('includes Read tool', () => {
      const tools = getAllTools();
      const found = tools.find((t) => t.name === 'Read');
      expect(found).toBeDefined();
    });

    it('includes Write tool', () => {
      const tools = getAllTools();
      const found = tools.find((t) => t.name === 'Write');
      expect(found).toBeDefined();
    });

    it('includes Edit tool', () => {
      const tools = getAllTools();
      const found = tools.find((t) => t.name === 'Edit');
      expect(found).toBeDefined();
    });

    it('all tools have required properties', () => {
      const tools = getAllTools();

      tools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(tool).toHaveProperty('execute');
      });
    });
  });

  describe('setPlanMode / isPlanMode', () => {
    it('sets and gets plan mode', () => {
      setPlanMode(true);
      expect(isPlanMode()).toBe(true);

      setPlanMode(false);
      expect(isPlanMode()).toBe(false);
    });

    it('defaults to false', () => {
      setPlanMode(false);
      expect(isPlanMode()).toBe(false);
    });

    it('can toggle multiple times', () => {
      setPlanMode(true);
      setPlanMode(false);
      setPlanMode(true);
      expect(isPlanMode()).toBe(true);
    });
  });

  describe('fuzzyFindToolNames', () => {
    it('finds tools by exact name', () => {
      const results = fuzzyFindToolNames('Read');
      expect(results).toContain('Read');
    });

    it('finds tools by partial match', () => {
      const results = fuzzyFindToolNames('rea');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns array for non-matching query', () => {
      const results = fuzzyFindToolNames('xyz_nonexistent_12345');
      expect(Array.isArray(results)).toBe(true);
    });

    it('respects max limit', () => {
      const results = fuzzyFindToolNames('', 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('returns unique tool names', () => {
      const results = fuzzyFindToolNames('');
      const uniqueResults = new Set(results);
      expect(results.length).toBe(uniqueResults.size);
    });
  });

  describe('toolSchemas', () => {
    it('returns array of tool schemas', () => {
      const schemas = toolSchemas();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
    });

    it('schemas have required properties', () => {
      const schemas = toolSchemas();

      schemas.forEach((schema) => {
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('input_schema');
      });
    });

    it('includes Read tool schema', () => {
      const schemas = toolSchemas();
      const readSchema = schemas.find((s) => s.name === 'Read');
      expect(readSchema).toBeDefined();
    });

    it('input_schema has type property', () => {
      const schemas = toolSchemas();
      schemas.forEach((schema) => {
        expect(schema.input_schema).toHaveProperty('type');
      });
    });
  });

  describe('tool context integration', () => {
    it('tools can access context after set', () => {
      const customContext: ToolContext = {
        anthropicClient: null,
        llmClient: null,
        model: 'claude-opus-5',
        maxTokens: 4096,
        cwd: '/custom/path',
      };

      setToolContext(customContext);
      const ctx = getCurrentContext();

      expect(ctx?.cwd).toBe('/custom/path');
      expect(ctx?.maxTokens).toBe(4096);
    });

    it('handles context updates', () => {
      setToolContext(mockContext);
      const updated = { ...mockContext, maxTokens: 16384 };
      setToolContext(updated);

      const ctx = getCurrentContext();
      expect(ctx?.maxTokens).toBe(16384);
    });
  });

  describe('edge cases', () => {
    it('handles empty query in fuzzyFind', () => {
      const results = fuzzyFindToolNames('');
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles special characters in fuzzyFind', () => {
      const results = fuzzyFindToolNames('Read*Write');
      expect(Array.isArray(results)).toBe(true);
    });

    it('getTool is case-sensitive', () => {
      const tool1 = getTool('Read');
      const tool2 = getTool('read');

      expect(tool1).toBeDefined();
      expect(tool2).toBeUndefined();
    });
  });
});
