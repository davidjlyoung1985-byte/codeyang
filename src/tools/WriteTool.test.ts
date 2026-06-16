import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeWrite } from './WriteTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-write-tool');

describe('WriteTool', () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should write a file with content', async () => {
    const fp = path.join(TEST_DIR, 'output.txt');
    const result = await executeWrite(fp, 'Hello, World!');
    expect(result).toContain('Written');
    expect(await fs.readFile(fp, 'utf-8')).toBe('Hello, World!');
  });

  it('should create parent directories automatically', async () => {
    const fp = path.join(TEST_DIR, 'deep', 'nested', 'dir', 'file.txt');
    await executeWrite(fp, 'nested');
    expect(existsSync(fp)).toBe(true);
  });

  it('should overwrite existing files', async () => {
    const fp = path.join(TEST_DIR, 'overwrite.txt');
    await executeWrite(fp, 'old');
    await executeWrite(fp, 'new');
    expect(await fs.readFile(fp, 'utf-8')).toBe('new');
  });

  it('should handle empty content', async () => {
    const fp = path.join(TEST_DIR, 'empty.txt');
    const result = await executeWrite(fp, '');
    expect(result).toContain('0 bytes');
  });

  it('should handle multi-line content', async () => {
    const fp = path.join(TEST_DIR, 'multiline.txt');
    await executeWrite(fp, 'line1\nline2\nline3\n');
    expect((await fs.readFile(fp, 'utf-8')).split('\n').length).toBe(4);
  });

  it('should handle Unicode content', async () => {
    const fp = path.join(TEST_DIR, 'unicode.txt');
    const content = 'Hello 世界 🌍\nこんにちは';
    await executeWrite(fp, content);
    expect(await fs.readFile(fp, 'utf-8')).toBe(content);
  });

  it('should handle large content', async () => {
    const fp = path.join(TEST_DIR, 'large.txt');
    const content = 'x'.repeat(10000);
    const result = await executeWrite(fp, content);
    expect(result).toContain('10000 bytes');
  });

  it('should handle relative paths', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(TEST_DIR);
      await executeWrite('relative-file.txt', 'rel');
      expect(existsSync(path.join(TEST_DIR, 'relative-file.txt'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle special characters in file path', async () => {
    const fp = path.join(TEST_DIR, 'file-with-dashes_and.dots.txt');
    await executeWrite(fp, 'special');
    expect(existsSync(fp)).toBe(true);
  });

  it('should handle JSON content', async () => {
    const fp = path.join(TEST_DIR, 'data.json');
    const obj = { key: 'value', nested: { a: 1 } };
    await executeWrite(fp, JSON.stringify(obj, null, 2));
    expect(JSON.parse(await fs.readFile(fp, 'utf-8'))).toEqual(obj);
  });

  it('should handle TypeScript code content', async () => {
    const fp = path.join(TEST_DIR, 'test.ts');
    const content = 'import { describe, it, expect } from "vitest";\n\ndescribe("test", () => {});\n';
    await executeWrite(fp, content);
    const written = await fs.readFile(fp, 'utf-8');
    expect(written).toContain('import');
  });
});
