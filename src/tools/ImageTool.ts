import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Supported image formats and their magic bytes */
const IMAGE_SIGNATURES: Array<{ ext: string; mime: string; magic: Buffer }> = [
  { ext: 'png', mime: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { ext: 'jpg', mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { ext: 'gif', mime: 'image/gif', magic: Buffer.from([0x47, 0x49, 0x46, 0x38]) },
  { ext: 'webp', mime: 'image/webp', magic: Buffer.from([0x52, 0x49, 0x46, 0x46]) },
  { ext: 'bmp', mime: 'image/bmp', magic: Buffer.from([0x42, 0x4d]) },
  { ext: 'ico', mime: 'image/x-icon', magic: Buffer.from([0x00, 0x00, 0x01, 0x00]) },
];

function detectFormat(buf: Buffer): { ext: string; mime: string } | null {
  for (const sig of IMAGE_SIGNATURES) {
    if (buf.subarray(0, sig.magic.length).equals(sig.magic)) {
      return { ext: sig.ext, mime: sig.mime };
    }
  }
  return null;
}

/** Read basic image dimensions from PNG/JPEG/GIF/WEBP headers */
function readDimensions(buf: Buffer, fmt: string): { width: number; height: number } | null {
  try {
    if (fmt === 'png') {
      // PNG: width at bytes 16-19, height at 20-23
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (fmt === 'jpg') {
      // JPEG: scan for SOF0/SOF2 markers (0xFFC0 / 0xFFC2)
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        const segLen = buf.readUInt16BE(i + 2);
        if (marker === 0xc0 || marker === 0xc2) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + segLen;
      }
    }
    if (fmt === 'gif') {
      // GIF: width at bytes 6-7, height at 8-9 (little-endian)
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (fmt === 'webp') {
      // WEBP VP8 chunk: dimensions at bytes 26-29
      if (buf.length > 30 && buf.subarray(12, 16).toString('ascii') === 'VP8 ') {
        return {
          width: (buf.readUInt16LE(26) & 0x3fff) + 1,
          height: (buf.readUInt16LE(28) & 0x3fff) + 1,
        };
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Read image metadata: format, dimensions, file size.
 */
export async function executeImageInfo(filePath: string): Promise<string> {
  try {
    const absPath = path.resolve(filePath);
    const stats = await fs.stat(absPath);
    // Read only first 64 bytes for format/dimension detection
    const fd = await fs.open(absPath, 'r');
    const header = Buffer.alloc(64);
    await fd.read(header, 0, 64, 0);
    await fd.close();

    const fmt = detectFormat(header);
    const dims = fmt ? readDimensions(header, fmt.ext) : null;

    const lines = [
      `File: ${absPath}`,
      `Size: ${stats.size} bytes (${(stats.size / 1024).toFixed(1)} KB)`,
      `Format: ${fmt ? `${fmt.ext.toUpperCase()} (${fmt.mime})` : 'unknown'}`,
    ];
    if (dims) lines.push(`Dimensions: ${dims.width} × ${dims.height} px`);
    lines.push(`Modified: ${stats.mtime.toISOString()}`);

    return lines.join('\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Encode image file to base64 data URI.
 * maxBytes guard prevents accidental encoding of huge files.
 */
export async function executeImageToBase64(filePath: string, maxBytes = 5_242_880): Promise<string> {
  try {
    const absPath = path.resolve(filePath);
    const stats = await fs.stat(absPath);

    if (stats.size > maxBytes) {
      return `Error: file too large (${(stats.size / 1024 / 1024).toFixed(1)} MB > ${maxBytes / 1024 / 1024} MB limit)`;
    }

    const buf = await fs.readFile(absPath);
    const fmt = detectFormat(buf);
    const mime = fmt?.mime ?? 'application/octet-stream';
    const b64 = buf.toString('base64');

    return `data:${mime};base64,${b64}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * List image files in a directory.
 */
export async function executeListImages(dirPath: string): Promise<string> {
  try {
    const absDir = path.resolve(dirPath);
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg', '.tiff', '.tif']);

    const entries = await fs.readdir(absDir, { withFileTypes: true });
    const images = entries
      .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
      .map((e) => e.name);

    if (images.length === 0) return `No image files found in: ${absDir}`;

    return [`Images in ${absDir} (${images.length}):`, ...images.map((n) => `  ${n}`)].join('\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
