import { describe, it, expect } from 'vitest';
import { executeGlob } from './GlobTool.js';
import { join } from 'node:path';
import { cwd } from 'node:process';

const projectRoot = cwd();
const srcRoot = join(projectRoot, 'src');

describe('GlobTool benchmarks', () => {
  it('**/*.ts over src/ under 500ms', async () => {
    const start = Date.now();
    const result = await executeGlob('**/*.ts', srcRoot);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    // Should find many TypeScript files under src/
    expect(result).not.toBe('(no matches)');
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(10);
  });

  it('narrow literal glob under 100ms', async () => {
    const start = Date.now();
    const result = await executeGlob('package.json', projectRoot);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toBe('package.json');
  });

  it('narrow glob with extension under 100ms', async () => {
    const start = Date.now();
    const result = await executeGlob('*.json', projectRoot);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toContain('package.json');
  });
});
