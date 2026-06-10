import { describe, it, expect } from 'vitest';
import { executeGlob } from './GlobTool.js';

describe('GlobTool benchmarks', () => {
  it('**/*.ts across project under 2000ms', async () => {
    const start = Date.now();
    const result = await executeGlob('**/*.ts');
    const elapsed = Date.now() - start;

    // 增加超时阈值，大型项目需要更多时间
    expect(elapsed).toBeLessThan(2000);
    expect(result).toContain('.ts');
  }, 10000); // 增加测试超时到 10 秒

  it('**/*.{ts,js,json} across project under 3000ms', async () => {
    const start = Date.now();
    const result = await executeGlob('**/*.{ts,js,json}');
    const elapsed = Date.now() - start;

    // 多文件类型需要更多时间
    expect(elapsed).toBeLessThan(3000);
    expect(result.length).toBeGreaterThan(0);
  }, 10000);

  it('src/**/*.ts under 2000ms', async () => {
    const start = Date.now();
    const result = await executeGlob('src/**/*.ts');
    const elapsed = Date.now() - start;

    // src 目录可能包含大量文件
    expect(elapsed).toBeLessThan(2000);
    expect(result).toContain('src/');
  }, 10000);

  it('single-level pattern *.ts (shallow) under 200ms', async () => {
    const start = Date.now();
    const result = await executeGlob('*.ts');
    const elapsed = Date.now() - start;

    // 浅层搜索应该很快
    expect(elapsed).toBeLessThan(200);
  }, 5000);
});
