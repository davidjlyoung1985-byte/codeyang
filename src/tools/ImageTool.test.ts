import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeImageInfo, executeImageToBase64, executeListImages } from './ImageTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-image');

/** Minimal valid 1×1 PNG (67 bytes) */
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  '77533800000000c49444154789c6260f8cf000001820170' +
  '5f46000000000049454e44ae426082',
  'hex',
);

/** Minimal 1×1 GIF87a */
const GIF_1x1 = Buffer.from('47494638376101000100800100000000ffffffff2c00000000010001000002024c01003b', 'hex');

beforeEach(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('ImageTool', () => {
  describe('executeImageInfo', () => {
    it('detects PNG format and dimensions', async () => {
      const file = path.join(TEST_DIR, 'test.png');
      await fs.writeFile(file, PNG_1x1);
      const result = await executeImageInfo(file);
      expect(result).toContain('PNG');
      expect(result).toContain('image/png');
      expect(result).toContain('1 × 1 px');
      expect(result).toContain('Size:');
    });

    it('detects GIF format', async () => {
      const file = path.join(TEST_DIR, 'test.gif');
      await fs.writeFile(file, GIF_1x1);
      const result = await executeImageInfo(file);
      expect(result).toContain('GIF');
      expect(result).toContain('image/gif');
    });

    it('handles unknown format gracefully', async () => {
      const file = path.join(TEST_DIR, 'test.bin');
      await fs.writeFile(file, Buffer.from([0x00, 0x01, 0x02, 0x03]));
      const result = await executeImageInfo(file);
      expect(result).toContain('unknown');
    });

    it('returns error for missing file', async () => {
      const result = await executeImageInfo(path.join(TEST_DIR, 'nonexistent.png'));
      expect(result).toContain('Error');
    });
  });

  describe('executeImageToBase64', () => {
    it('encodes PNG to base64 data URI', async () => {
      const file = path.join(TEST_DIR, 'test.png');
      await fs.writeFile(file, PNG_1x1);
      const result = await executeImageToBase64(file);
      expect(result).toMatch(/^data:image\/png;base64,/);
      // verify it decodes back correctly
      const b64 = result.replace('data:image/png;base64,', '');
      expect(Buffer.from(b64, 'base64')).toEqual(PNG_1x1);
    });

    it('rejects files exceeding maxBytes', async () => {
      const file = path.join(TEST_DIR, 'big.png');
      await fs.writeFile(file, Buffer.alloc(100));
      const result = await executeImageToBase64(file, 10);
      expect(result).toContain('Error');
      expect(result).toContain('too large');
    });

    it('returns error for missing file', async () => {
      const result = await executeImageToBase64(path.join(TEST_DIR, 'missing.png'));
      expect(result).toContain('Error');
    });
  });

  describe('executeListImages', () => {
    it('lists image files in directory', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'a.png'), PNG_1x1);
      await fs.writeFile(path.join(TEST_DIR, 'b.gif'), GIF_1x1);
      await fs.writeFile(path.join(TEST_DIR, 'c.txt'), 'text');
      const result = await executeListImages(TEST_DIR);
      expect(result).toContain('a.png');
      expect(result).toContain('b.gif');
      expect(result).not.toContain('c.txt');
    });

    it('returns message when no images found', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'readme.txt'), 'hello');
      const result = await executeListImages(TEST_DIR);
      expect(result).toContain('No image files found');
    });

    it('returns error for missing directory', async () => {
      const result = await executeListImages('/nonexistent/path/xyz');
      expect(result).toContain('Error');
    });
  });
});
