import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { StreamingFileReader, readLargeFile, readLastLines, searchInLargeFile } from './streamingFileReader.js';

describe('StreamingFileReader', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `streaming-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    testFile = join(tempDir, 'test.txt');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readChunks', () => {
    it('should read file in chunks', async () => {
      const content = 'a'.repeat(1000);
      await writeFile(testFile, content);

      const reader = new StreamingFileReader(testFile, { chunkSize: 100 });
      const chunks: Buffer[] = [];

      for await (const chunk of reader.readChunks()) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(Buffer.concat(chunks).toString()).toBe(content);
    });

    it('should respect start and end offsets', async () => {
      await writeFile(testFile, 'Hello World!');

      const reader = new StreamingFileReader(testFile, { start: 6, end: 10 });
      const chunks: Buffer[] = [];

      for await (const chunk of reader.readChunks()) {
        chunks.push(chunk);
      }

      expect(Buffer.concat(chunks).toString()).toBe('World');
    });
  });

  describe('readLines', () => {
    it('should read file line by line', async () => {
      const lines = ['line 1', 'line 2', 'line 3'];
      await writeFile(testFile, lines.join('\n'));

      const reader = new StreamingFileReader(testFile);
      const result: string[] = [];

      for await (const line of reader.readLines()) {
        result.push(line);
      }

      expect(result).toEqual(lines);
    });

    it('should handle empty lines', async () => {
      await writeFile(testFile, 'line 1\n\nline 3');

      const reader = new StreamingFileReader(testFile);
      const result: string[] = [];

      for await (const line of reader.readLines()) {
        result.push(line);
      }

      expect(result).toEqual(['line 1', '', 'line 3']);
    });

    it('should handle CRLF line endings', async () => {
      await writeFile(testFile, 'line 1\r\nline 2\r\n');

      const reader = new StreamingFileReader(testFile);
      const result: string[] = [];

      for await (const line of reader.readLines()) {
        result.push(line);
      }

      expect(result).toEqual(['line 1', 'line 2']);
    });
  });

  describe('getSize', () => {
    it('should return file size', async () => {
      const content = 'Hello World!';
      await writeFile(testFile, content);

      const reader = new StreamingFileReader(testFile);
      const size = await reader.getSize();

      expect(size).toBe(Buffer.byteLength(content));
    });
  });

  describe('shouldStream', () => {
    it('should return true for large files', async () => {
      const largeContent = 'a'.repeat(11 * 1024 * 1024); // 11MB
      await writeFile(testFile, largeContent);

      const reader = new StreamingFileReader(testFile);
      expect(await reader.shouldStream()).toBe(true);
    });

    it('should return false for small files', async () => {
      await writeFile(testFile, 'small');

      const reader = new StreamingFileReader(testFile);
      expect(await reader.shouldStream()).toBe(false);
    });

    it('should respect custom threshold', async () => {
      await writeFile(testFile, 'a'.repeat(1000));

      const reader = new StreamingFileReader(testFile);
      expect(await reader.shouldStream(500)).toBe(true);
      expect(await reader.shouldStream(2000)).toBe(false);
    });
  });
});

describe('readLargeFile', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `streaming-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    testFile = join(tempDir, 'test.txt');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should read entire file', async () => {
    const content = 'Hello World!';
    await writeFile(testFile, content);

    const result = await readLargeFile(testFile);
    expect(result).toBe(content);
  });

  it('should call progress callback', async () => {
    const content = 'a'.repeat(1000);
    await writeFile(testFile, content);

    const progressCalls: Array<{ bytesRead: number; totalBytes: number }> = [];

    await readLargeFile(testFile, (bytesRead, totalBytes) => {
      progressCalls.push({ bytesRead, totalBytes });
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1].bytesRead).toBe(1000);
  });
});

describe('readLastLines', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `streaming-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    testFile = join(tempDir, 'test.txt');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should read last N lines', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    await writeFile(testFile, lines.join('\n'));

    const result = await readLastLines(testFile, 5);

    expect(result).toEqual(['line 96', 'line 97', 'line 98', 'line 99', 'line 100']);
  });

  it('should handle request for more lines than file has', async () => {
    await writeFile(testFile, 'line 1\nline 2');

    const result = await readLastLines(testFile, 10);

    expect(result).toEqual(['line 1', 'line 2']);
  });
});

describe('searchInLargeFile', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `streaming-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    testFile = join(tempDir, 'test.txt');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should find matching lines', async () => {
    const lines = ['foo bar', 'baz qux', 'foo baz', 'hello world'];
    await writeFile(testFile, lines.join('\n'));

    const results: Array<{ line: string; lineNumber: number; match: string }> = [];
    for await (const result of searchInLargeFile(testFile, /foo/)) {
      results.push(result);
    }

    expect(results).toHaveLength(2);
    expect(results[0].line).toBe('foo bar');
    expect(results[0].lineNumber).toBe(1);
    expect(results[1].line).toBe('foo baz');
    expect(results[1].lineNumber).toBe(3);
  });

  it('should respect max results limit', async () => {
    const lines = Array.from({ length: 100 }, () => 'match');
    await writeFile(testFile, lines.join('\n'));

    const results: unknown[] = [];
    for await (const result of searchInLargeFile(testFile, /match/, 10)) {
      results.push(result);
    }

    expect(results).toHaveLength(10);
  });

  it('should return empty for no matches', async () => {
    await writeFile(testFile, 'foo\nbar\nbaz');

    const results: unknown[] = [];
    for await (const result of searchInLargeFile(testFile, /notfound/)) {
      results.push(result);
    }

    expect(results).toHaveLength(0);
  });
});
