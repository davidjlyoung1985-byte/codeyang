/**
 * Tests for shared utilities (resolveSafePath, exports)
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('resolveSafePath', () => {
  let resolveSafePath: typeof import('./shared.js')['resolveSafePath'];

  beforeEach(async () => {
    resolveSafePath = (await import('./shared.js')).resolveSafePath;
  });

  it('resolves relative paths', () => {
    const result = resolveSafePath('./package.json');
    expect(result).toContain('package.json');
  });

  it('resolves absolute paths', () => {
    const result = resolveSafePath('/tmp');
    // Should resolve to some absolute path
    expect(result).toBeTruthy();
  });
});

describe('shared exports', () => {
  it('exports all expected functions', async () => {
    const mod = await import('./shared.js');
    expect(mod.executeRead).toBeDefined();
    expect(mod.executeWrite).toBeDefined();
    expect(mod.executeEdit).toBeDefined();
    expect(mod.executeGlob).toBeDefined();
    expect(mod.matchGlob).toBeDefined();
    expect(mod.executeGrep).toBeDefined();
    expect(mod.executeTodoWrite).toBeDefined();
    expect(mod.getTodos).toBeDefined();
    expect(mod.resetTodos).toBeDefined();
    expect(mod.executeWebFetch).toBeDefined();
    expect(mod.executeSearch).toBeDefined();
    expect(mod.executeImageInfo).toBeDefined();
    expect(mod.executeImageToBase64).toBeDefined();
    expect(mod.executeListImages).toBeDefined();
  });
});
