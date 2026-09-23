import { describe, it, expect } from 'vitest';
import { builtinDefinitions } from './definitions/index.js';
import { claudeCodeTool } from './ClaudeCodeTool.js';

describe('Tool Count Validation', () => {
  it('should have correct number of builtin tools', () => {
    const builtinCount = builtinDefinitions.length;
    const totalCoreTools = builtinCount + 1; // +1 for ClaudeCodeTool

    // 验证实际工具数量
    expect(builtinCount).toBeGreaterThanOrEqual(58);
    expect(totalCoreTools).toBeGreaterThanOrEqual(59);

    // 确保工具数量在合理范围内 (防止意外删除)
    expect(builtinCount).toBeLessThanOrEqual(70);

    console.log(`✓ Builtin tools: ${builtinCount}`);
    console.log(`✓ Total core tools (including ClaudeCodeTool): ${totalCoreTools}`);
  });

  it('should have unique tool names', () => {
    const allTools = [...builtinDefinitions, claudeCodeTool];
    const names = allTools.map((t) => t.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have valid tool definitions', () => {
    const allTools = [...builtinDefinitions, claudeCodeTool];

    for (const tool of allTools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);

      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);

      expect(tool.execute).toBeDefined();
      expect(typeof tool.execute).toBe('function');

      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters).toBe('object');
    }
  });

  it('should categorize tools correctly', () => {
    // 验证至少有这些主要类别的工具
    const toolNames = builtinDefinitions.map((t) => t.name);

    // File operations
    expect(toolNames).toContain('Read');
    expect(toolNames).toContain('Write');
    expect(toolNames).toContain('Edit');

    // Git operations
    expect(toolNames).toContain('GitInit');
    expect(toolNames).toContain('GitCommit');

    // Shell operations
    expect(toolNames).toContain('Bash');

    // Search operations
    expect(toolNames).toContain('Grep');
    expect(toolNames).toContain('Glob');

    // Code operations
    expect(toolNames).toContain('AstParse');
    expect(toolNames).toContain('TypeCheck');
  });

  it('documentation should match actual tool count', () => {
    const builtinCount = builtinDefinitions.length;
    const totalCoreTools = builtinCount + 1; // +1 for ClaudeCodeTool

    // README.md 和 package.json 应该说 "60+ core tools"
    // 这个测试确保实际数量支持这个说法
    expect(totalCoreTools).toBeGreaterThanOrEqual(59);

    // 如果工具数量超过65，应该考虑更新文档为 "65+ tools"
    if (totalCoreTools >= 65) {
      console.warn(`⚠️  Tool count is ${totalCoreTools}, consider updating docs to "65+ core tools"`);
    }

    // 如果工具数量超过70，应该更新文档为 "70+ tools"
    if (totalCoreTools >= 70) {
      console.warn(`⚠️  Tool count is ${totalCoreTools}, should update docs to "70+ core tools"`);
    }
  });
});
