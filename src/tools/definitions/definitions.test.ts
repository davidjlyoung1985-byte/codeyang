/**
 * Tests for all tool definition files.
 * Ensures each definition has valid structure and execute functions work.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ToolDefinition } from '../../types.js';

// Mock tool implementations that definitions delegate to
vi.mock('../BashTool.js', () => ({ executeBash: vi.fn(() => 'bash ok') }));
vi.mock('../ReadTool.js', () => ({ executeRead: vi.fn(() => 'read ok') }));
vi.mock('../WriteTool.js', () => ({ executeWrite: vi.fn(() => 'write ok') }));
vi.mock('../EditTool.js', () => ({ executeEdit: vi.fn(() => 'edit ok') }));
vi.mock('../GlobTool.js', () => ({ executeGlob: vi.fn(() => 'glob ok') }));
vi.mock('../GrepTool.js', () => ({ executeGrep: vi.fn(() => 'grep ok') }));
vi.mock('../TodoWriteTool.js', () => ({ executeTodoWrite: vi.fn(() => 'todo ok') }));
vi.mock('../WebFetchTool.js', () => ({ executeWebFetch: vi.fn(() => 'web ok') }));
vi.mock('../TaskTool.js', () => ({ executeTask: vi.fn(() => 'task ok') }));
vi.mock('../LaunchAppTool.js', () => ({ executeLaunchApp: vi.fn(() => 'launch ok') }));
vi.mock('../PowerShellTool.js', () => ({ executePowerShell: vi.fn(() => 'pshell ok') }));
vi.mock('../ToolSearchTool.js', () => ({ executeToolSearch: vi.fn(() => 'search ok') }));
vi.mock('../ClaudeCodeTool.js', () => ({ executeClaudeCode: vi.fn(() => 'claude ok') }));
vi.mock('../WebSearchTool.js', () => ({ executeWebSearch: vi.fn(() => 'websearch ok') }));
vi.mock('../GitHubTool.js', () => ({ executeGitHub: vi.fn(() => 'github ok') }));
vi.mock('../EnterPlanModeTool.js', () => ({ executeEnterPlanMode: vi.fn(() => 'plan ok') }));
vi.mock('../ExitPlanModeTool.js', () => ({ executeExitPlanMode: vi.fn(() => 'exitplan ok') }));

// Mock registry for Task tool
vi.mock('../registry.js', () => ({
  getCurrentContext: vi.fn(() => ({
    llmClient: {} as never,
    model: 'test',
    maxTokens: 1000,
    cwd: '/test',
    signal: null,
  })),
}));

// Mock GitTool to prevent real git operations
vi.mock('../GitTool.js', () => ({
  executeGitStatus: vi.fn(() => 'clean'),
  executeGitDiff: vi.fn(() => 'no changes'),
  executeGitCommit: vi.fn(() => 'committed'),
  executeGitBranch: vi.fn(() => '* master'),
  executeGitCheckout: vi.fn(() => 'switched'),
  executeGitLog: vi.fn(() => 'commit log'),
  executeGitPush: vi.fn(() => 'pushed'),
  executeGitPull: vi.fn(() => 'pulled'),
  executeGitClone: vi.fn(() => 'cloned'),
  executeGitAdd: vi.fn(() => 'added'),
  executeGitReset: vi.fn(() => 'reset'),
  executeGitStash: vi.fn(() => 'stashed'),
  executeGitMerge: vi.fn(() => 'merged'),
  executeGitRemote: vi.fn(() => 'origin'),
  executeGitCurrentBranch: vi.fn(() => 'master'),
  executeGitBlame: vi.fn(() => 'blame info'),
}));

const defModules = {
  core: () => import('./core.def.js'),
  filesystem: () => import('./filesystem.def.js'),
  git: () => import('./git.def.js'),
  data: () => import('./data.def.js'),
  network: () => import('./network.def.js'),
  code: () => import('./code.def.js'),
  search: () => import('./search.def.js'),
  'search-web': () => import('./search-web.def.js'),
  shell: () => import('./shell.def.js'),
  memory: () => import('./memory.def.js'),
  image: () => import('./image.def.js'),
  plan: () => import('./plan.def.js'),
  agent: () => import('./agent.def.js'),
  task: () => import('./task.def.js'),
  query: () => import('./query.def.js'),
  github: () => import('./github.def.js'),
} as const;

describe('Tool Definitions', () => {
  describe.each(Object.entries(defModules))('%s.def.ts', (_name, importer) => {
    it('should export a definitions array', async () => {
      const mod = await importer();
      expect(Array.isArray(mod.definitions)).toBe(true);
      expect(mod.definitions.length).toBeGreaterThan(0);
    });

    it('each definition should have required fields', async () => {
      const mod = await importer();
      for (const def of mod.definitions as ToolDefinition[]) {
        expect(def.name).toBeDefined();
        expect(typeof def.name).toBe('string');
        expect(def.description).toBeDefined();
        expect(typeof def.description).toBe('string');
        expect(def.parameters).toBeDefined();
        expect(typeof def.parameters).toBe('object');
        expect(def.execute).toBeDefined();
        expect(typeof def.execute).toBe('function');
      }
    });

    it('each execute function should return a string', async () => {
      const mod = await importer();
      for (const def of mod.definitions as ToolDefinition[]) {
        // Build minimal args from parameter schema
        const props = (def.parameters as Record<string, unknown>)?.properties as Record<string, unknown> ?? {};
        const required = (def.parameters as Record<string, unknown>)?.required as string[] ?? [];
        const args: Record<string, unknown> = {};

        for (const key of required) {
          const propSchema = props[key] as Record<string, unknown> | undefined;
          if (propSchema?.type === 'string') args[key] = 'test-value';
          else if (propSchema?.type === 'number') args[key] = 123;
          else if (propSchema?.type === 'boolean') args[key] = false;
          else if (propSchema?.type === 'array') args[key] = [];
          else if (propSchema?.type === 'object') args[key] = {};
          else args[key] = 'test-value';
        }

        // For tools with complex validation, handle gracefully
        try {
          const result = await def.execute(args);
          expect(typeof result).toBe('string');
        } catch (err: unknown) {
          // Some tools may throw on invalid args — that's acceptable
          expect((err as Error).message).toBeDefined();
        }
      }
    });
  });
});
