import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeSearch } from './SearchTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-search');

beforeEach(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(path.join(TEST_DIR, 'foo.ts'), 'export function fooHelper() { return 42; }');
  await fs.writeFile(path.join(TEST_DIR, 'bar.ts'), 'import { fooHelper } from "./foo.js";\nconsole.log(fooHelper());');
  await fs.writeFile(path.join(TEST_DIR, 'readme.md'), '# Project\nThis uses fooHelper internally.');
  await fs.mkdir(path.join(TEST_DIR, 'sub'), { recursive: true });
  await fs.writeFile(path.join(TEST_DIR, 'sub', 'baz.ts'), 'const x = 1;');
});

afterEach(async () => {
  if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('SearchTool', () => {
  it('finds files by name', async () => {
    const result = await executeSearch('foo', TEST_DIR, { searchContent: false });
    expect(result).toContain('foo.ts');
    expect(result).toContain('File name matches');
  });

  it('finds files by content', async () => {
    const result = await executeSearch('fooHelper', TEST_DIR, { searchNames: false });
    expect(result).toContain('Content matches');
    expect(result).toContain('fooHelper');
  });

  it('combined search returns name matches first', async () => {
    const result = await executeSearch('foo', TEST_DIR);
    const nameIdx = result.indexOf('File name matches');
    const contentIdx = result.indexOf('Content matches');
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(contentIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeLessThan(contentIdx);
  });

  it('respects includeGlob filter', async () => {
    const result = await executeSearch('fooHelper', TEST_DIR, { includeGlob: '*.md', searchNames: false });
    expect(result).toContain('readme.md');
    expect(result).not.toContain('foo.ts');
  });

  it('respects maxResults', async () => {
    const result = await executeSearch('foo', TEST_DIR, { maxResults: 1 });
    expect(result).toContain('Found 1 result');
  });

  it('returns no results message when nothing found', async () => {
    const result = await executeSearch('zzznonexistent999', TEST_DIR);
    expect(result).toContain('No results found');
  });

  it('returns error for empty query', async () => {
    const result = await executeSearch('', TEST_DIR);
    expect(result).toContain('Error');
  });

  it('returns error for missing directory', async () => {
    const result = await executeSearch('foo', '/nonexistent/path/xyz');
    expect(result).toContain('Error');
  });
});
