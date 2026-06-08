import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all tool modules that registry imports
vi.mock('./BashTool.js', () => ({ executeBash: vi.fn() }));
vi.mock('./ReadTool.js', () => ({ executeRead: vi.fn() }));
vi.mock('./WriteTool.js', () => ({ executeWrite: vi.fn() }));
vi.mock('./EditTool.js', () => ({ executeEdit: vi.fn() }));
vi.mock('./GlobTool.js', () => ({ executeGlob: vi.fn(), matchGlob: vi.fn() }));
vi.mock('./GrepTool.js', () => ({ executeGrep: vi.fn() }));
vi.mock('./TodoWriteTool.js', () => ({ executeTodoWrite: vi.fn(), getTodos: vi.fn(), resetTodos: vi.fn() }));
vi.mock('./WebFetchTool.js', () => ({ executeWebFetch: vi.fn() }));
vi.mock('./FileSystemTool.js', () => ({
  executeCopy: vi.fn(), executeMove: vi.fn(), executeDelete: vi.fn(),
  executeMkdir: vi.fn(), executeList: vi.fn(), executeExists: vi.fn(),
}));
vi.mock('./DataTool.js', () => ({
  executeJsonParse: vi.fn(), executeJsonWrite: vi.fn(), executeJsonQuery: vi.fn(),
  executeYamlParse: vi.fn(), executeYamlWrite: vi.fn(), executeConvert: vi.fn(),
  executeCsvParse: vi.fn(), executeCsvWrite: vi.fn(), executeXmlParse: vi.fn(), executeXmlWrite: vi.fn(),
}));
vi.mock('./GitTool.js', () => ({
  executeGitStatus: vi.fn(), executeGitDiff: vi.fn(), executeGitCommit: vi.fn(),
  executeGitBranch: vi.fn(), executeGitCheckout: vi.fn(), executeGitLog: vi.fn(),
  executeGitPush: vi.fn(), executeGitPull: vi.fn(), executeGitClone: vi.fn(),
  executeGitAdd: vi.fn(), executeGitReset: vi.fn(), executeGitStash: vi.fn(),
  executeGitMerge: vi.fn(), executeGitRemote: vi.fn(), executeGitCurrentBranch: vi.fn(),
  executeGitBlame: vi.fn(),
}));
vi.mock('./CodeAnalysisTool.js', () => ({
  executeParseAst: vi.fn(), executeAnalyzeCode: vi.fn(), executeComplexity: vi.fn(),
  executeLint: vi.fn(), executeFindDeps: vi.fn(), executeCountLines: vi.fn(),
}));
vi.mock('./NetworkTool.js', () => ({
  executeHttpRequest: vi.fn(), executeDownloadFile: vi.fn(), executeUploadFile: vi.fn(),
  executeApiCall: vi.fn(), executeCheckUrl: vi.fn(), executeParseUrl: vi.fn(),
}));
vi.mock('../math/MathSolve.js', () => ({ executeMathSolve: vi.fn() }));
vi.mock('../math/MathPlot.js', () => ({ executeMathPlot: vi.fn() }));
vi.mock('../math/MathExplain.js', () => ({ executeMathExplain: vi.fn() }));
vi.mock('./SearchTool.js', () => ({ executeSearch: vi.fn() }));
vi.mock('./ImageTool.js', () => ({ executeImageInfo: vi.fn(), executeImageToBase64: vi.fn(), executeListImages: vi.fn() }));
vi.mock('../agent/LLMClient.js', () => ({ LLMClient: {} }));

import { getTool, toolSchemas, registerQtTools, registerMathTools, type ToolDefinition } from './registry.js';

describe('registry', () => {
  describe('getTool', () => {
    it('finds built-in tools by name', () => {
      const bash = getTool('Bash');
      expect(bash).toBeDefined();
      expect(bash!.name).toBe('Bash');
    });

    it('returns undefined for unknown tools', () => {
      const unknown = getTool('NonExistentTool');
      expect(unknown).toBeUndefined();
    });

    it('is case-sensitive', () => {
      const wrongCase = getTool('bash');
      expect(wrongCase).toBeUndefined();
    });

    it('finds Read tool', () => {
      expect(getTool('Read')).toBeDefined();
    });

    it('finds Write tool', () => {
      expect(getTool('Write')).toBeDefined();
    });

    it('finds GitStatus tool', () => {
      expect(getTool('GitStatus')).toBeDefined();
    });

    it('finds Question tool', () => {
      expect(getTool('Question')).toBeDefined();
    });
  });

  describe('toolSchemas', () => {
    it('returns an array of schemas', () => {
      const schemas = toolSchemas();
      expect(Array.isArray(schemas)).toBe(true);
    });

    it('includes built-in tools', () => {
      const schemas = toolSchemas();
      const names = schemas.map((s) => s.name);
      expect(names).toContain('Bash');
      expect(names).toContain('Read');
      expect(names).toContain('WebFetch');
    });

    it('every schema has name, description, and input_schema', () => {
      const schemas = toolSchemas();
      for (const s of schemas) {
        expect(s.name).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(s.input_schema).toBeDefined();
        expect(s.input_schema.type).toBe('object');
      }
    });
  });

  describe('registerQtTools', () => {
    it('adds Qt tools to the registry which getTool can find', () => {
      const qtDef: ToolDefinition = {
        name: 'QtBuild',
        description: 'Qt build tool',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'ok',
      };

      // Qt tools not in default registry
      expect(getTool('QtBuild')).toBeUndefined();

      registerQtTools([qtDef]);

      // Now it should be findable
      expect(getTool('QtBuild')).toBeDefined();
      expect(getTool('QtBuild')!.name).toBe('QtBuild');
    });

    it('replaces previously registered Qt tools', () => {
      const oldTool: ToolDefinition = {
        name: 'QtOld', description: 'old', parameters: { type: 'object', properties: {} },
        execute: async () => 'old',
      };
      const newTool: ToolDefinition = {
        name: 'QtNew', description: 'new', parameters: { type: 'object', properties: {} },
        execute: async () => 'new',
      };

      registerQtTools([oldTool]);
      expect(getTool('QtOld')).toBeDefined();

      registerQtTools([newTool]);
      expect(getTool('QtOld')).toBeUndefined();
      expect(getTool('QtNew')).toBeDefined();
    });

    it('included Qt tools in toolSchemas', () => {
      const qtDef: ToolDefinition = {
        name: 'QtTest', description: 'test', parameters: { type: 'object', properties: {} },
        execute: async () => 'ok',
      };
      registerQtTools([qtDef]);

      const schemas = toolSchemas();
      const names = schemas.map((s) => s.name);
      expect(names).toContain('QtTest');
    });
  });

  describe('registerMathTools', () => {
    it('adds math tools to the registry which getTool can find', () => {
      const mathDef: ToolDefinition = {
        name: 'MathSolve',
        description: 'Solve math',
        parameters: { type: 'object', properties: { problem: { type: 'string' } } },
        execute: async () => 'solution',
      };

      // Math tools are not in default registry
      expect(getTool('MathSolve')).toBeUndefined();

      registerMathTools([mathDef]);
      expect(getTool('MathSolve')).toBeDefined();
    });

    it('replaces previously registered math tools', () => {
      const oldTool: ToolDefinition = {
        name: 'MathOld', description: 'old', parameters: { type: 'object', properties: {} },
        execute: async () => 'old',
      };
      registerMathTools([oldTool]);
      expect(getTool('MathOld')).toBeDefined();

      registerMathTools([]);
      expect(getTool('MathOld')).toBeUndefined();
    });

    it('included math tools in toolSchemas', () => {
      const mathDef: ToolDefinition = {
        name: 'MathPlot', description: 'plot', parameters: { type: 'object', properties: { kind: { type: 'string' } } },
        execute: async () => 'svg',
      };
      registerMathTools([mathDef]);

      const schemas = toolSchemas();
      const names = schemas.map((s) => s.name);
      expect(names).toContain('MathPlot');
    });
  });
});
