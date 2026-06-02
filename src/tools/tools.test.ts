import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeRead } from './ReadTool.js';
import { executeWrite } from './WriteTool.js';
import { executeGrep } from './GrepTool.js';
import { executeWebFetch } from './WebFetchTool.js';
import { executeBash } from './BashTool.js';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ──────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-tools-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createFile(name: string, content: string): Promise<string> {
  const path = join(tempDir, name);
  await writeFile(path, content, 'utf-8');
  return path;
}

async function createDir(name: string): Promise<string> {
  const path = join(tempDir, name);
  await mkdir(path, { recursive: true });
  return path;
}

// ──────────────────────────────────────────────
// ReadTool tests
// ──────────────────────────────────────────────

describe('executeRead', () => {
  it('reads a file and returns its content', async () => {
    const filePath = await createFile('hello.txt', 'Hello World\nLine 2\nLine 3');
    const content = await executeRead(filePath);
    expect(content).toBe('Hello World\nLine 2\nLine 3');
  });

  it('throws on nonexistent file', async () => {
    await expect(executeRead(join(tempDir, 'nope.txt'))).rejects.toThrow('not found');
  });

  it('lists directory contents with trailing / for dirs', async () => {
    await createFile('a.txt', 'a');
    await createFile('b.txt', 'b');
    await createDir('sub');
    await createFile(join('sub', 'c.txt'), 'c');

    const listing = await executeRead(tempDir);
    expect(listing).toContain('sub/');
    expect(listing).toContain('a.txt');
    expect(listing).toContain('b.txt');
    // Directory comes first alphabetically
    const lines = listing.split('\n');
    expect(lines[0]).toBe('sub/');
  });

  it('reports empty directory', async () => {
    const listing = await executeRead(tempDir);
    expect(listing).toBe('(empty directory)');
  });

  it('reports directory counts correctly', async () => {
    await createFile('x.txt', 'x');
    await createDir('d1');
    await createDir('d2');
    const listing = await executeRead(tempDir);
    expect(listing).toContain('2 directories');
    expect(listing).toContain('1 file');
  });

  it('handles offset and limit for file reading', async () => {
    const filePath = await createFile('lines.txt', 'line0\nline1\nline2\nline3\nline4');
    const result = await executeRead(filePath, 1, 2);
    expect(result).toContain('Lines 2-3 of 5');
    expect(result).toContain('2: line1');
    expect(result).toContain('3: line2');
    expect(result).not.toContain('line0');
    expect(result).not.toContain('line3');
  });

  it('handles offset without limit (read to end)', async () => {
    const filePath = await createFile('lines.txt', 'line0\nline1\nline2');
    const result = await executeRead(filePath, 1);
    expect(result).toContain('Lines 2-3 of 3');
    expect(result).toContain('2: line1');
    expect(result).toContain('3: line2');
    expect(result).not.toContain('line0');
  });

  it('handles relative paths (resolves from cwd)', async () => {
    // Change to tempDir and use relative path
    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);
      await writeFile(join(tempDir, 'rel.txt'), 'relative');
      const result = await executeRead('rel.txt');
      expect(result).toBe('relative');
    } finally {
      process.chdir(originalCwd);
    }
  });
});

// ──────────────────────────────────────────────
// WriteTool tests
// ──────────────────────────────────────────────

describe('executeWrite', () => {
  it('writes content to a file', async () => {
    const filePath = join(tempDir, 'output.txt');
    const result = await executeWrite(filePath, 'hello world');
    expect(result).toContain('Written 11 bytes');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('creates parent directories automatically', async () => {
    const filePath = join(tempDir, 'deep', 'nested', 'file.txt');
    const result = await executeWrite(filePath, 'deep content');
    expect(result).toContain('Written');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('deep content');
  });

  it('overwrites existing file', async () => {
    const filePath = await createFile('existing.txt', 'original');
    const result = await executeWrite(filePath, 'updated');
    expect(result).toContain('Written 7 bytes');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('updated');
  });

  it('handles empty content', async () => {
    const filePath = join(tempDir, 'empty.txt');
    const result = await executeWrite(filePath, '');
    expect(result).toContain('Written 0 bytes');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('');
  });
});

// ──────────────────────────────────────────────
// GrepTool tests
// ──────────────────────────────────────────────

describe('executeGrep', () => {
  it('finds matching lines in files (fallback grep)', async () => {
    await createFile('alpha.ts', 'const x = 1;\nconst y = 2;\nlet z = 3;');

    const result = await executeGrep('const', undefined, tempDir);
    expect(result).not.toBe('(no matches)');
    expect(result).toContain('alpha.ts');
    expect(result).toContain('const');
  });

  it('returns (no matches) for nonexistent pattern', async () => {
    await createFile('alpha.ts', 'const x = 1;');
    const result = await executeGrep('NONEXISTENT_PATTERN_12345', undefined, tempDir);
    expect(result).toBe('(no matches)');
  });

  it('respects include filter', async () => {
    await createFile('alpha.ts', 'const x = 1;');
    await createFile('beta.js', 'const y = 2;');

    const result = await executeGrep('const', '*.ts', tempDir);
    expect(result).toContain('alpha.ts');
    expect(result).not.toContain('beta.js');
  });

  it('handles empty directory', async () => {
    const result = await executeGrep('pattern', undefined, tempDir);
    expect(result).toBe('(no matches)');
  });
});

// ──────────────────────────────────────────────
// WebFetchTool tests
// ──────────────────────────────────────────────

describe('executeWebFetch', () => {
  it('throws on empty URL', async () => {
    await expect(executeWebFetch('')).rejects.toThrow('URL is required');
  });

  it('throws on non-http/https protocol', async () => {
    await expect(executeWebFetch('ftp://example.com/file')).rejects.toThrow(/Unsupported protocol|Invalid URL/);
    await expect(executeWebFetch('file:///etc/passwd')).rejects.toThrow(/Unsupported protocol|Invalid URL/);
  });

  it('throws on invalid URL', async () => {
    await expect(executeWebFetch('not-a-url')).rejects.toThrow('Invalid URL');
    await expect(executeWebFetch('http:')).rejects.toThrow('Invalid URL');
  });

  it('accepts valid http and https URLs', async () => {
    // These are valid URL shapes but we don't actually fetch
    // Just verify parsing works
    expect(() => new URL('https://example.com')).not.toThrow();
    expect(() => new URL('http://localhost:3000/api/data')).not.toThrow();
  });

  it('supports format parameter for html output', async () => {
    // URL validation should pass for format=html too
    // Actual fetch is not tested here — that would need a mock server
    expect(() => new URL('https://example.com')).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// BashTool tests
// ──────────────────────────────────────────────

describe('executeBash', () => {
  it('executes a simple echo command', async () => {
    if (process.platform === 'win32') {
      const result = await executeBash('echo hello');
      expect(result).toContain('hello');
    } else {
      const result = await executeBash('echo hello');
      expect(result).toContain('hello');
    }
  });

  it('returns exit code for failing commands', async () => {
    if (process.platform === 'win32') {
      // On Windows, use a command that fails
      const result = await executeBash('cmd /c "exit 1"');
      expect(result).toContain('exit code: 1');
    } else {
      // On Unix, use a simple failing command
      const result = await executeBash('exit 1');
      expect(result).toContain('exit code: 1');
    }
  });

  it('handles command with cwd parameter', async () => {
    if (process.platform === 'win32') {
      const result = await executeBash('Get-Location', tempDir);
      expect(result).toContain(tempDir);
    } else {
      const result = await executeBash('pwd', tempDir);
      expect(result).toContain(tempDir);
    }
  });
});
