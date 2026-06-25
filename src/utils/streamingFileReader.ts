/**
 * Streaming file reader for large files.
 *
 * Prevents memory exhaustion when reading files >10MB.
 * Uses Node.js streams for efficient chunk-by-chunk processing.
 *
 * Usage:
 *   const reader = new StreamingFileReader('/large/file.log');
 *   for await (const chunk of reader.read()) {
 *     console.log(chunk);
 *   }
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

export interface StreamOptions {
  /** Chunk size in bytes (default: 64KB) */
  chunkSize?: number;
  /** Start offset in bytes */
  start?: number;
  /** End offset in bytes */
  end?: number;
  /** Encoding (default: utf-8) */
  encoding?: BufferEncoding;
}

export class StreamingFileReader {
  constructor(
    private filePath: string,
    private options: StreamOptions = {},
  ) {}

  /**
   * Read file as chunks (binary mode).
   */
  async *readChunks(): AsyncGenerator<Buffer> {
    const { chunkSize = 64 * 1024, start, end } = this.options;

    const stream = createReadStream(this.filePath, {
      highWaterMark: chunkSize,
      start,
      end,
    });

    try {
      for await (const chunk of stream) {
        yield chunk as Buffer;
      }
    } finally {
      stream.destroy();
    }
  }

  /**
   * Read file line-by-line (text mode).
   */
  async *readLines(): AsyncGenerator<string> {
    const { encoding = 'utf-8', start, end } = this.options;

    const stream = createReadStream(this.filePath, {
      encoding,
      start,
      end,
    });

    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        yield line;
      }
    } finally {
      rl.close();
      stream.destroy();
    }
  }

  /**
   * Get file size in bytes.
   */
  async getSize(): Promise<number> {
    const stats = await stat(this.filePath);
    return stats.size;
  }

  /**
   * Check if file should use streaming (>10MB).
   */
  async shouldStream(threshold = 10 * 1024 * 1024): Promise<boolean> {
    const size = await this.getSize();
    return size > threshold;
  }
}

/**
 * Read large file with progress callback.
 */
export async function readLargeFile(
  filePath: string,
  onProgress?: (bytesRead: number, totalBytes: number) => void,
): Promise<string> {
  const reader = new StreamingFileReader(filePath);
  const totalBytes = await reader.getSize();
  let bytesRead = 0;
  const chunks: string[] = [];

  for await (const chunk of reader.readChunks()) {
    chunks.push(chunk.toString('utf-8'));
    bytesRead += chunk.length;
    onProgress?.(bytesRead, totalBytes);
  }

  return chunks.join('');
}

/**
 * Read last N lines from file efficiently (tail-like).
 */
export async function readLastLines(filePath: string, lineCount: number): Promise<string[]> {
  const reader = new StreamingFileReader(filePath);
  const size = await reader.getSize();

  // Estimate: average line is ~80 chars
  const estimatedBytes = lineCount * 80;
  const start = Math.max(0, size - estimatedBytes * 2); // Read 2x for safety

  const lines: string[] = [];
  const streamReader = new StreamingFileReader(filePath, { start });

  for await (const line of streamReader.readLines()) {
    lines.push(line);
  }

  return lines.slice(-lineCount);
}

/**
 * Search in large file without loading entire file into memory.
 */
export async function* searchInLargeFile(
  filePath: string,
  pattern: RegExp,
  maxResults = 100,
): AsyncGenerator<{ line: string; lineNumber: number; match: string }> {
  const reader = new StreamingFileReader(filePath);
  let lineNumber = 0;
  let resultCount = 0;

  for await (const line of reader.readLines()) {
    lineNumber++;

    const match = line.match(pattern);
    if (match) {
      yield {
        line,
        lineNumber,
        match: match[0],
      };

      resultCount++;
      if (resultCount >= maxResults) break;
    }
  }
}
