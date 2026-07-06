import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

/**
 * Large file streaming utilities
 */

export interface StreamReadOptions {
  offset?: number;
  limit?: number;
  chunkSize?: number;
}

const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB chunks

/**
 * Read large file in chunks using streams
 * More memory-efficient for files > 10MB
 */
export async function readLargeFileChunked(filePath: string, options: StreamReadOptions = {}): Promise<string> {
  const { offset = 0, limit, chunkSize = DEFAULT_CHUNK_SIZE } = options;

  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let bytesRead = 0;

    const stream = createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: chunkSize,
      start: offset > 0 ? offset : undefined,
    });

    stream.on('data', (chunk: string) => {
      chunks.push(chunk);
      bytesRead += Buffer.byteLength(chunk, 'utf-8');

      // Stop if we've read enough
      if (limit && bytesRead >= limit) {
        stream.destroy();
        resolve(chunks.join('').slice(0, limit));
      }
    });

    stream.on('end', () => {
      resolve(chunks.join(''));
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Read large file line by line (memory efficient)
 */
export async function readLargeFileByLine(
  filePath: string,
  callback: (line: string, lineNumber: number) => boolean | void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    let shouldStop = false;

    rl.on('line', (line) => {
      if (shouldStop) return;

      lineNumber++;
      const result = callback(line, lineNumber);

      // If callback returns false, stop reading
      if (result === false) {
        shouldStop = true;
        rl.close();
        stream.destroy();
      }
    });

    rl.on('close', () => {
      resolve(lineNumber);
    });

    rl.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Read file with pagination (offset + limit)
 * Uses streaming for large files
 */
export async function readFileWithPagination(
  filePath: string,
  offset: number = 0,
  limit: number = 1000,
): Promise<{ lines: string[]; totalLines: number; hasMore: boolean }> {
  const stats = await stat(filePath);
  const isLarge = stats.size > 10 * 1024 * 1024; // 10MB

  const lines: string[] = [];
  let totalLines = 0;
  let currentLine = 0;

  if (isLarge) {
    // Use streaming for large files
    await readLargeFileByLine(filePath, (line) => {
      totalLines++;

      if (totalLines > offset && currentLine < limit) {
        lines.push(line);
        currentLine++;
      }

      // Continue until we have enough lines
      return currentLine < limit;
    });
  } else {
    // Use normal read for small files
    const content = await readLargeFileChunked(filePath);
    const allLines = content.split('\n');
    totalLines = allLines.length;
    lines.push(...allLines.slice(offset, offset + limit));
  }

  return {
    lines,
    totalLines,
    hasMore: totalLines > offset + limit,
  };
}

/**
 * Get file size and determine if streaming is recommended
 */
export async function shouldUseStreaming(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.size > 10 * 1024 * 1024; // > 10MB
  } catch {
    return false;
  }
}

/**
 * Read file tail (last N lines) efficiently
 */
export async function readFileTail(filePath: string, lines: number = 100): Promise<string[]> {
  const stats = await stat(filePath);
  const chunkSize = 64 * 1024; // 64KB chunks from end

  // For small files, just read all
  if (stats.size < chunkSize) {
    const content = await readLargeFileChunked(filePath);
    return content.split('\n').slice(-lines);
  }

  // For large files, read from end in chunks
  return new Promise((resolve, reject) => {
    let position = stats.size;
    let buffer = '';

    const readChunk = () => {
      const start = Math.max(0, position - chunkSize);

      const stream = createReadStream(filePath, {
        encoding: 'utf-8',
        start,
        end: position - 1,
      });

      let chunk = '';

      stream.on('data', (data: string) => {
        chunk = data + chunk;
      });

      stream.on('end', () => {
        buffer = chunk + buffer;
        const allLines = buffer.split('\n');

        if (allLines.length >= lines || start === 0) {
          // We have enough lines or reached start
          resolve(allLines.slice(-lines));
        } else {
          // Need more lines, read previous chunk
          position = start;
          readChunk();
        }
      });

      stream.on('error', reject);
    };

    readChunk();
  });
}
