/**
 * Extended tests for MathPlot and MathExplain to improve coverage.
 */
import { describe, it, expect } from 'vitest';
import { executeMathPlot } from './MathPlot.js';
import { executeMathExplain } from './MathExplain.js';

describe('MathPlot', () => {
  it('generates coordinate plane help text', async () => {
    const result = await executeMathPlot('coordinate');
    expect(result).toContain('Coordinate');
  });

  it('generates function graph', async () => {
    const result = await executeMathPlot('func:x*2+1');
    expect(result).toContain('y = x*2+1');
  });

  it('handles invalid function expression', async () => {
    const result = await executeMathPlot('func:1/0');
    expect(result).toBeDefined();
  });

  it('generates triangle', async () => {
    const result = await executeMathPlot('triangle');
    expect(result).toContain('Triangle');
  });

  it('generates bar chart', async () => {
    const result = await executeMathPlot('bar:A=5,B=8,C=3');
    expect(result).toContain('Bar Chart');
  });

  it('handles empty bar chart data', async () => {
    const result = await executeMathPlot('bar:');
    expect(result).toContain('Error');
  });

  it('generates pie chart', async () => {
    const result = await executeMathPlot('pie:A=30,B=20');
    expect(result).toContain('Pie Chart');
  });

  it('handles empty pie chart data', async () => {
    const result = await executeMathPlot('pie:');
    expect(result).toContain('Error');
  });

  it('generates scatter plot', async () => {
    const result = await executeMathPlot('scatter:(1,2),(3,5)');
    expect(result).toContain('Scatter Plot');
  });

  it('handles empty scatter plot data', async () => {
    const result = await executeMathPlot('scatter:');
    expect(result).toContain('Error');
  });

  it('returns help for unknown kind', async () => {
    const result = await executeMathPlot('');
    expect(result).toContain('MathPlot');
  });

  it('blocks dangerous expression patterns', async () => {
    const result = await executeMathPlot('func:process.exit()');
    expect(result).toContain('blocked');
  });
});

describe('MathExplain', () => {
  it('returns topic list when no argument', () => {
    const result = executeMathExplain();
    expect(result).toContain('Available topics');
  });

  it('returns linear equation content', () => {
    const result = executeMathExplain('linear');
    expect(result).toContain('一元一次方程');
    expect(result).toContain('移项');
  });

  it('returns quadratic equation content', () => {
    const result = executeMathExplain('quadratic');
    expect(result).toContain('一元二次方程');
    expect(result).toContain('求根公式');
  });

  it('returns Pythagorean theorem content', () => {
    const result = executeMathExplain('pythagorean');
    expect(result).toContain('勾股定理');
  });

  it('returns stats content', () => {
    const result = executeMathExplain('stats');
    expect(result).toContain('平均数');
    expect(result).toContain('中位数');
  });

  it('returns circle content', () => {
    const result = executeMathExplain('circle');
    expect(result).toContain('圆的');
  });

  it('returns probability content', () => {
    const result = executeMathExplain('probability');
    expect(result).toContain('概率');
  });

  it('returns function content', () => {
    const result = executeMathExplain('function');
    expect(result).toContain('一次函数');
  });

  it('handles unknown topic', () => {
    const result = executeMathExplain('nonexistent_topic_xyz');
    expect(result).toContain('Unknown topic');
  });

  it('handles Chinese topic names via aliases', () => {
    const result = executeMathExplain('方程');
    expect(result).toContain('一元一次方程');
  });
});
