/* eslint-disable @typescript-eslint/require-await -- ToolDefinition interface requires async execute methods */
import type { Method } from 'axios';
import type { ToolDefinition } from '../../types.js';
import {
  executeHttpRequest,
  executeDownloadFile,
  executeUploadFile,
  executeApiCall,
  executeCheckUrl,
  executeParseUrl,
} from '../NetworkTool.js';
import { requiredString, optionalString, optionalNumber } from '../validate.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'HttpRequest',
    description:
      'Send HTTP request with configurable method, headers, and body. Returns response with status, headers, and data.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL' },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
          description: 'HTTP method (default: GET)',
        },
        headers: { type: 'object', description: 'Request headers (optional)' },
        body: { type: 'string', description: 'Request body for POST/PUT/PATCH (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = requiredString(args, 'url');
      const method = (args['method'] as Method) || 'GET';
      const headers = args['headers'] as Record<string, string> | undefined;
      const body = optionalString(args, 'body');
      const timeout = optionalNumber(args, 'timeout', 30000) ?? 30000;
      return executeHttpRequest(url, method, headers, body, timeout);
    },
  },
  {
    name: 'DownloadFile',
    description: 'Download file from URL to local path. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Source URL' },
        destPath: { type: 'string', description: 'Destination file path' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)' },
      },
      required: ['url', 'destPath'],
    },
    execute: async (args) => {
      const url = requiredString(args, 'url');
      const destPath = requiredString(args, 'destPath');
      const timeout = optionalNumber(args, 'timeout', 60000) ?? 60000;
      return executeDownloadFile(url, destPath, timeout);
    },
  },
  {
    name: 'UploadFile',
    description: 'Upload file to server via multipart/form-data. Can include additional form fields.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL' },
        filePath: { type: 'string', description: 'Local file path to upload' },
        fieldName: { type: 'string', description: 'Form field name for file (default: "file")' },
        additionalFields: { type: 'object', description: 'Additional form fields (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)' },
      },
      required: ['url', 'filePath'],
    },
    execute: async (args) => {
      const url = requiredString(args, 'url');
      const filePath = requiredString(args, 'filePath');
      const fieldName = optionalString(args, 'fieldName', 'file') ?? 'file';
      const additionalFields = args['additionalFields'] as Record<string, string> | undefined;
      const timeout = optionalNumber(args, 'timeout', 60000) ?? 60000;
      return executeUploadFile(url, filePath, fieldName, additionalFields, timeout);
    },
  },
  {
    name: 'ApiCall',
    description: 'Call RESTful API with JSON body and parse response. Automatic Content-Type: application/json.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'API endpoint URL' },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
          description: 'HTTP method (default: GET)',
        },
        body: { type: 'object', description: 'JSON request body (optional)' },
        headers: { type: 'object', description: 'Additional headers (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = requiredString(args, 'url');
      const method = (args['method'] as Method) || 'GET';
      const body = args['body'];
      const headers = args['headers'] as Record<string, string> | undefined;
      const timeout = optionalNumber(args, 'timeout', 30000) ?? 30000;
      return executeApiCall(url, method, body, headers, timeout);
    },
  },
  {
    name: 'CheckUrl',
    description: 'Check if URL is accessible. Returns status, response time, content type, and server info.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to check' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 10000)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = requiredString(args, 'url');
      const timeout = optionalNumber(args, 'timeout', 10000) ?? 10000;
      return executeCheckUrl(url, timeout);
    },
  },
  {
    name: 'ParseUrl',
    description: 'Parse URL and extract components (protocol, host, port, pathname, query parameters, hash).',
    parameters: {
      type: 'object',
      properties: {
        urlString: { type: 'string', description: 'URL string to parse' },
      },
      required: ['urlString'],
    },
    execute: async (args) => {
      const urlString = requiredString(args, 'urlString');
      return executeParseUrl(urlString);
    },
  },
];
