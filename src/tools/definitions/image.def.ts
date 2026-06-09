import type { ToolDefinition } from '../../types.js';
import { executeImageInfo, executeImageToBase64, executeListImages } from '../ImageTool.js';
import { requiredString, optionalNumber } from '../validate.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'ImageInfo',
    description: 'Read image file metadata: format, dimensions, file size. Supports PNG, JPEG, GIF, WEBP, BMP, ICO.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the image file' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      return executeImageInfo(filePath);
    },
  },
  {
    name: 'ImageToBase64',
    description: 'Encode an image file to a base64 data URI string. Max 5 MB by default.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the image file' },
        maxBytes: { type: 'number', description: 'Max file size in bytes (default: 5242880 = 5 MB)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = requiredString(args, 'filePath');
      const maxBytes = optionalNumber(args, 'maxBytes');
      return executeImageToBase64(filePath, maxBytes);
    },
  },
  {
    name: 'ListImages',
    description: 'List all image files in a directory (PNG, JPEG, GIF, WEBP, BMP, ICO, SVG, TIFF).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to scan' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const dirPath = requiredString(args, 'path');
      return executeListImages(dirPath);
    },
  },
];
